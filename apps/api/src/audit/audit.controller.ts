import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

interface AuthenticatedRequest {
  user: { organizationId: string };
}

/**
 * Read-only by design. There is no POST, PATCH or DELETE here and there should
 * never be one — entries are written by the services that perform the actions,
 * inside the same transaction, and a trail anyone can edit is not a trail.
 */
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * SUPER_ADMIN only.
   *
   * Narrower than the user list, which HR_ADMIN and TEAM_LEAD can also read.
   * This records what colleagues *did*, which is a different kind of exposure
   * from who they are — and an HR admin appears in it as a subject, not only as
   * a reader. Widening this is a deliberate decision, not a default.
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() query: ListAuditLogsDto, @Req() req: AuthenticatedRequest) {
    return this.auditService.findAll(req.user.organizationId, query);
  }
}
