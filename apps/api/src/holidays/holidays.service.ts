import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { fromDbDate, toDbDate } from '../attendance/attendance-time';
import type { CreateHolidayDto, UpdateHolidayDto } from './dto/holiday.dto';

export interface HolidayCaller {
  id: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

const HOLIDAY_SELECT = {
  id: true,
  name: true,
  date: true,
  type: true,
  repeatsAnnually: true,
} satisfies Prisma.HolidaySelect;

type HolidayRow = Prisma.HolidayGetPayload<{ select: typeof HOLIDAY_SELECT }>;

/**
 * The organisation's holiday calendar. A holiday is never a day anyone is late
 * or absent on; working one is still recorded as present.
 *
 * Like work rules, a change applies from the next punch — summaries already
 * written are not rewritten.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The holidays falling in `year`: those dated in it, plus every annual one,
   * shown on its date in that year so a calendar can place it.
   */
  async findForYear(organizationId: string, year: number) {
    const rows = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        OR: [
          {
            date: {
              gte: toDbDate(`${year}-01-01`),
              lte: toDbDate(`${year}-12-31`),
            },
          },
          { repeatsAnnually: true },
        ],
      },
      select: HOLIDAY_SELECT,
    });

    return (
      rows
        .map((h) => {
          const stored = fromDbDate(h.date);
          const onDate = h.repeatsAnnually
            ? `${year}-${stored.slice(5)}`
            : stored;
          return { ...present(h), onDate };
        })
        // 29 February in a non-leap year has no date to show on.
        .filter((h) => isRealDate(h.onDate))
        .sort((a, b) => a.onDate.localeCompare(b.onDate))
    );
  }

  async create(dto: CreateHolidayDto, caller: HolidayCaller, ip?: string) {
    assertRealDate(dto.date);

    return this.withUniqueness(() =>
      this.prisma.$transaction(async (tx) => {
        const holiday = await tx.holiday.create({
          data: {
            organizationId: caller.organizationId,
            name: dto.name,
            date: toDbDate(dto.date),
            ...(dto.type !== undefined && { type: dto.type }),
            ...(dto.repeatsAnnually !== undefined && {
              repeatsAnnually: dto.repeatsAnnually,
            }),
          },
          select: HOLIDAY_SELECT,
        });
        await this.record(tx, caller, 'HOLIDAY_CREATED', holiday, ip);
        return present(holiday);
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateHolidayDto,
    caller: HolidayCaller,
    ip?: string,
  ) {
    await this.load(id, caller.organizationId);
    if (dto.date !== undefined) assertRealDate(dto.date);

    return this.withUniqueness(() =>
      this.prisma.$transaction(async (tx) => {
        const holiday = await tx.holiday.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.date !== undefined && { date: toDbDate(dto.date) }),
            ...(dto.type !== undefined && { type: dto.type }),
            ...(dto.repeatsAnnually !== undefined && {
              repeatsAnnually: dto.repeatsAnnually,
            }),
          },
          select: HOLIDAY_SELECT,
        });
        await this.record(tx, caller, 'HOLIDAY_UPDATED', holiday, ip);
        return present(holiday);
      }),
    );
  }

  async remove(id: string, caller: HolidayCaller, ip?: string) {
    const existing = await this.load(id, caller.organizationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.record(tx, caller, 'HOLIDAY_DELETED', existing, ip);
    });
  }

  private async load(id: string, organizationId: string): Promise<HolidayRow> {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, organizationId },
      select: HOLIDAY_SELECT,
    });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }

  private async withUniqueness<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A holiday with that name already exists on that date',
        );
      }
      throw e;
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    caller: HolidayCaller,
    action: 'HOLIDAY_CREATED' | 'HOLIDAY_UPDATED' | 'HOLIDAY_DELETED',
    holiday: HolidayRow,
    ip?: string,
  ) {
    return this.audit.record(
      {
        organizationId: caller.organizationId,
        actor: { id: caller.id, name: caller.name, role: caller.role },
        action,
        targetType: 'Holiday',
        targetId: holiday.id,
        targetLabel: `${holiday.name} (${fromDbDate(holiday.date)})`,
        ipAddress: ip,
      },
      tx,
    );
  }
}

function isRealDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** The DTO's pattern accepts 2026-02-31; JavaScript would read it as 3 March. */
function assertRealDate(date: string) {
  if (!isRealDate(date)) {
    throw new BadRequestException(`${date} is not a real date.`);
  }
}

function present(h: HolidayRow) {
  return {
    id: h.id,
    name: h.name,
    date: fromDbDate(h.date),
    type: h.type,
    repeatsAnnually: h.repeatsAnnually,
  };
}
