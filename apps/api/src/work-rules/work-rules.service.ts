import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OvertimeBasis, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { formatClockTime, parseClockTime } from '../attendance/attendance-time';
import type { CreateWorkRuleDto, UpdateWorkRuleDto } from './dto/work-rule.dto';

export interface WorkRuleCaller {
  id: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

const RULE_SELECT = {
  id: true,
  name: true,
  isDefault: true,
  workingDays: true,
  startMinutes: true,
  endMinutes: true,
  gracePeriodMinutes: true,
  overtimeBasis: true,
  overtimeAfterMinutes: true,
  overtimeMultiplier: true,
  offices: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.WorkRuleSelect;

type RuleRow = Prisma.WorkRuleGetPayload<{ select: typeof RULE_SELECT }>;

/**
 * Working-hours rules (Phase 3 M2, decision 2): several per organisation,
 * exactly one the default, optionally assigned to offices.
 *
 * What changes here takes effect from the next punch. A day already summarised
 * keeps the rule it was judged against — AttendanceSummary snapshots start,
 * end and grace — so moving 08:00 to 09:00 in March does not quietly rewrite
 * who was late in January.
 */
@Injectable()
export class WorkRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string) {
    const rules = await this.prisma.workRule.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: RULE_SELECT,
    });
    return rules.map(present);
  }

  async findOne(id: string, organizationId: string) {
    return present(await this.load(id, organizationId));
  }

  async create(dto: CreateWorkRuleDto, caller: WorkRuleCaller, ip?: string) {
    const { startMinutes, endMinutes } = toMinutes(dto.startTime, dto.endTime);
    const overtime = resolveOvertime(dto, null);

    return this.withUniqueName(dto.name, caller.organizationId, null, () =>
      this.prisma.$transaction(async (tx) => {
        const hasDefault =
          (await tx.workRule.count({
            where: { organizationId: caller.organizationId, isDefault: true },
          })) > 0;

        // The first rule is the default whatever the request said: rules
        // with no default would judge nobody, which reads as "the feature
        // does not work" rather than "pick a default".
        const isDefault = dto.isDefault === true || !hasDefault;

        if (isDefault && hasDefault) {
          // Clear the old default BEFORE setting the new one. The partial
          // unique index allows one default per organisation, so the other
          // order fails with a constraint violation.
          await tx.workRule.updateMany({
            where: { organizationId: caller.organizationId, isDefault: true },
            data: { isDefault: false },
          });
        }

        const rule = await tx.workRule.create({
          data: {
            organizationId: caller.organizationId,
            name: dto.name,
            isDefault,
            workingDays: sortDays(dto.workingDays),
            startMinutes,
            endMinutes,
            gracePeriodMinutes: dto.gracePeriodMinutes ?? 0,
            ...overtime,
            ...(dto.overtimeMultiplier !== undefined && {
              overtimeMultiplier: dto.overtimeMultiplier,
            }),
          },
          select: RULE_SELECT,
        });

        await this.record(tx, caller, 'WORK_RULE_CREATED', rule, ip);
        return present(rule);
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateWorkRuleDto,
    caller: WorkRuleCaller,
    ip?: string,
  ) {
    const existing = await this.load(id, caller.organizationId);

    // Either time may be sent alone, so validate the PAIR that will result,
    // not just the field that changed: moving only the end to before the
    // existing start is as much an overnight shift as sending both.
    const { startMinutes, endMinutes } = toMinutes(
      dto.startTime ?? formatClockTime(existing.startMinutes),
      dto.endTime ?? formatClockTime(existing.endMinutes),
    );

    const overtime = resolveOvertime(dto, existing);

    if (dto.isDefault === false && existing.isDefault) {
      throw new BadRequestException(
        'This is the default rule. Make another rule the default instead.',
      );
    }

    return this.withUniqueName(
      dto.name ?? existing.name,
      caller.organizationId,
      existing.id,
      () =>
        this.prisma.$transaction(async (tx) => {
          if (dto.isDefault === true && !existing.isDefault) {
            await tx.workRule.updateMany({
              where: { organizationId: caller.organizationId, isDefault: true },
              data: { isDefault: false },
            });
          }

          const rule = await tx.workRule.update({
            where: { id: existing.id },
            data: {
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.workingDays !== undefined && {
                workingDays: sortDays(dto.workingDays),
              }),
              startMinutes,
              endMinutes,
              ...(dto.gracePeriodMinutes !== undefined && {
                gracePeriodMinutes: dto.gracePeriodMinutes,
              }),
              ...overtime,
              ...(dto.overtimeMultiplier !== undefined && {
                overtimeMultiplier: dto.overtimeMultiplier,
              }),
              ...(dto.isDefault === true && { isDefault: true }),
            },
            select: RULE_SELECT,
          });

          await this.record(tx, caller, 'WORK_RULE_UPDATED', rule, ip);
          return present(rule);
        }),
    );
  }

  async remove(id: string, caller: WorkRuleCaller, ip?: string) {
    const existing = await this.load(id, caller.organizationId);

    if (existing.isDefault) {
      const others = await this.prisma.workRule.count({
        where: { organizationId: caller.organizationId, NOT: { id } },
      });
      if (others > 0) {
        throw new BadRequestException(
          'This is the default rule. Make another rule the default before deleting it.',
        );
      }
    }

    // Offices using it fall back to the default (ON DELETE SET NULL), and
    // past summaries keep their snapshot of start, end and grace.
    await this.prisma.$transaction(async (tx) => {
      await tx.workRule.delete({ where: { id: existing.id } });
      await this.record(tx, caller, 'WORK_RULE_DELETED', existing, ip);
    });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async load(id: string, organizationId: string): Promise<RuleRow> {
    const rule = await this.prisma.workRule.findFirst({
      where: { id, organizationId },
      select: RULE_SELECT,
    });
    if (!rule) throw new NotFoundException('Work rule not found');
    return rule;
  }

  /**
   * Turns a duplicate name into a 409. P2002 is a unique violation, but this
   * table has two unique constraints — (organizationId, name) and the
   * one-default partial index — and Prisma 7 does not report which fired in
   * a stable shape (`meta.target` is not a field list under the pg driver
   * adapter; parsing it once made every duplicate name a 500). So ask the
   * question directly: does another rule here already have this name?
   */
  private async withUniqueName<T>(
    name: string,
    organizationId: string,
    excludeId: string | null,
    run: () => Promise<T>,
  ) {
    try {
      return await run();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const clash = await this.prisma.workRule.findFirst({
          where: {
            organizationId,
            name,
            ...(excludeId && { NOT: { id: excludeId } }),
          },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException(
            `A work rule named "${name}" already exists`,
          );
        }
      }
      throw e;
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    caller: WorkRuleCaller,
    action: 'WORK_RULE_CREATED' | 'WORK_RULE_UPDATED' | 'WORK_RULE_DELETED',
    rule: { id: string; name: string },
    ip?: string,
  ) {
    return this.audit.record(
      {
        organizationId: caller.organizationId,
        actor: { id: caller.id, name: caller.name, role: caller.role },
        action,
        targetType: 'WorkRule',
        targetId: rule.id,
        targetLabel: rule.name,
        ipAddress: ip,
      },
      tx,
    );
  }
}

/**
 * Phase 3 decision 5: no overnight shifts. The database refuses them too, but
 * as a 500; this turns it into an explanation the screen can show.
 */
function toMinutes(startTime: string, endTime: string) {
  const startMinutes = parseClockTime(startTime);
  const endMinutes = parseClockTime(endTime);
  if (startMinutes === null || endMinutes === null) {
    throw new BadRequestException('Times must look like 08:00');
  }
  if (endMinutes <= startMinutes) {
    throw new BadRequestException(
      'The end time must be after the start time. Overnight shifts are not supported yet.',
    );
  }
  return { startMinutes, endMinutes };
}

/**
 * The overtime basis and threshold a create or update will leave the rule
 * with, validated as a pair (like the start and end times).
 *
 * Backward compatible on purpose. Before 27 Oct the only basis was "after N
 * minutes worked", and the time-regulation screen sends `overtimeAfterMinutes`
 * without knowing a basis exists. So a request that sends a threshold and no
 * basis means DAILY_HOURS, exactly as it always did; a request that sends
 * neither gets the new default, END_TIME. An explicit basis always wins, and
 * a contradictory pair is refused rather than half-applied.
 *
 * The threshold is cleared for any basis but DAILY_HOURS, so a stored number
 * can never be mistaken for one that is in use.
 */
function resolveOvertime(
  dto: Pick<CreateWorkRuleDto, 'overtimeBasis' | 'overtimeAfterMinutes'>,
  existing: {
    overtimeBasis: OvertimeBasis;
    overtimeAfterMinutes: number | null;
  } | null,
): { overtimeBasis: OvertimeBasis; overtimeAfterMinutes: number | null } {
  const sentThreshold = dto.overtimeAfterMinutes !== undefined;
  const threshold = sentThreshold
    ? (dto.overtimeAfterMinutes ?? null)
    : (existing?.overtimeAfterMinutes ?? null);

  let basis: OvertimeBasis;
  if (dto.overtimeBasis !== undefined) {
    basis = dto.overtimeBasis;
    if (
      basis !== OvertimeBasis.DAILY_HOURS &&
      sentThreshold &&
      threshold !== null
    ) {
      throw new BadRequestException(
        'overtimeAfterMinutes only applies when overtimeBasis is DAILY_HOURS.',
      );
    }
  } else if (sentThreshold) {
    // The pre-27-Oct meaning: a number is "after this many minutes", and null
    // was "no overtime".
    basis = threshold === null ? OvertimeBasis.NONE : OvertimeBasis.DAILY_HOURS;
  } else {
    basis = existing?.overtimeBasis ?? OvertimeBasis.END_TIME;
  }

  if (basis === OvertimeBasis.DAILY_HOURS && threshold === null) {
    throw new BadRequestException(
      'Say how many minutes of work a day count before overtime (overtimeAfterMinutes).',
    );
  }

  return {
    overtimeBasis: basis,
    overtimeAfterMinutes:
      basis === OvertimeBasis.DAILY_HOURS ? threshold : null,
  };
}

function sortDays(days: number[]) {
  return [...days].sort((a, b) => a - b);
}

function present(rule: RuleRow) {
  return {
    id: rule.id,
    name: rule.name,
    isDefault: rule.isDefault,
    workingDays: rule.workingDays,
    startTime: formatClockTime(rule.startMinutes),
    endTime: formatClockTime(rule.endMinutes),
    gracePeriodMinutes: rule.gracePeriodMinutes,
    overtimeBasis: rule.overtimeBasis,
    overtimeAfterMinutes: rule.overtimeAfterMinutes,
    // Decimal on the wire would be a string; a multiplier is a plain number.
    overtimeMultiplier: rule.overtimeMultiplier.toNumber(),
    offices: rule.offices,
  };
}
