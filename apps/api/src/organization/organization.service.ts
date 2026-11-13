import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateOrganizationDto } from './organization.dto';

const ORG_SELECT = {
  id: true,
  name: true,
  industry: true,
  timezone: true,
} satisfies Prisma.OrganizationSelect;

/**
 * The caller's own organisation — there is no id in any route here, so nobody
 * can address another tenant's.
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findMine(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: ORG_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(
    dto: UpdateOrganizationDto,
    caller: {
      id: string;
      name: string;
      role: UserRole;
      organizationId: string;
    },
    ip?: string,
  ) {
    const before = await this.findMine(caller.organizationId);

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: caller.organizationId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.industry !== undefined && { industry: dto.industry }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        },
        select: ORG_SELECT,
      });

      // The timezone matters enough to name in the trail: changing it moves
      // where midnight falls for every punch from now on. Earlier punches keep
      // the day they were recorded on — PunchEvent.workDate is stored.
      const label =
        dto.timezone !== undefined && dto.timezone !== before.timezone
          ? `${org.name} (timezone ${before.timezone} → ${org.timezone})`
          : org.name;

      await this.audit.record(
        {
          organizationId: caller.organizationId,
          actor: { id: caller.id, name: caller.name, role: caller.role },
          action: 'ORGANIZATION_UPDATED',
          targetType: 'Organization',
          targetId: org.id,
          targetLabel: label,
          ipAddress: ip,
        },
        tx,
      );
      return org;
    });
  }
}
