import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OrganizationService } from './organization.service';
import { UpdateOrganizationDto } from './organization.dto';

interface AuthenticatedRequest {
  user: { id: string; name: string; role: UserRole; organizationId: string };
  ip?: string;
}

@ApiBearerAuth()
@Controller('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  findMine(@Req() req: AuthenticatedRequest) {
    return this.organization.findMine(req.user.organizationId);
  }

  /** Super admin only: the timezone changes what every punch means. */
  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  update(@Body() dto: UpdateOrganizationDto, @Req() req: AuthenticatedRequest) {
    return this.organization.update(dto, req.user, req.ip);
  }
}
