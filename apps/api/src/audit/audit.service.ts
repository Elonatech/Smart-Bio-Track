import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAuditLogsDto } from './dto/list-audit-logs.dto';

/**
 * Every action worth answering for later.
 *
 * A union rather than a Prisma enum: Phase 3 adds CLOCK_IN, PUNCH_APPROVED,
 * DEVICE_REVOKED and more, and an enum would mean a database migration per
 * action. This keeps the write side type-safe — a typo is a compile error —
 * while the column stays a plain string.
 */
export const AUDIT_ACTIONS = [
  'USER_PROVISIONED',
  'USER_SUSPENDED',
  'USER_RESTORED',
  'USER_DELETED',
  'INVITATION_RESENT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Who did it. Absent for actions the system takes on its own. */
export interface AuditActor {
  id: string;
  name: string;
  role: UserRole;
}

export interface AuditEntry {
  organizationId: string;
  actor: AuditActor | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** How the target read at the time — a name, not an id to resolve later. */
  targetLabel?: string;
  ipAddress?: string;
}

/**
 * The minimum a Prisma transaction client needs to expose for `record` to run
 * inside it. Typed this narrowly so the method accepts both `PrismaService`
 * and the `tx` handed to a `$transaction` callback.
 */
type AuditWriter = {
  auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => unknown };
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one audit row.
   *
   * **Call this inside the same transaction as the action it describes.** Every
   * caller passes its `tx`, which means a failed audit write rolls the action
   * back with it. That is deliberate and it is the whole point: an audit trail
   * with gaps is worse than useless, because it invites the assumption that
   * anything missing never happened. Better to refuse the suspension than to
   * perform one nobody can account for.
   *
   * There is no update and no delete. Not because nothing needs them, but
   * because an append-only table is the only kind whose contents can be relied
   * on in a dispute.
   */
  record(entry: AuditEntry, tx?: AuditWriter): unknown {
    const client = tx ?? (this.prisma as unknown as AuditWriter);

    return client.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorId: entry.actor?.id ?? null,
        // "System" rather than null, so a reader never has to guess whether a
        // blank actor means an automated action or a bug.
        actorName: entry.actor?.name ?? 'System',
        actorRole: entry.actor?.role ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  /**
   * One page of an organization's trail, newest first.
   *
   * Scoped by organizationId like every other list in the system — one tenant's
   * admin reading another's audit trail would be a worse leak than the staff
   * directory, since this records what people did rather than merely who they
   * are.
   */
  async findAll(organizationId: string, query: ListAuditLogsDto) {
    const { page, limit } = query;
    const search = query.q?.trim();

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(search
        ? {
            OR: [
              { actorName: { contains: search, mode: 'insensitive' } },
              { targetLabel: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        // createdAt alone is not deterministic — two rows written inside the
        // same transaction share a timestamp, and would shuffle between pages.
        // Same reasoning as the user list; see the log's load-bearing section.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          actorName: true,
          actorRole: true,
          action: true,
          targetType: true,
          targetId: true,
          targetLabel: true,
          ipAddress: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
