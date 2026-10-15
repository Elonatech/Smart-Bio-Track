import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WorkRulesService } from './work-rules.service';
import { CreateWorkRuleDto, UpdateWorkRuleDto } from './dto/work-rule.dto';

interface AuthenticatedRequest {
  user: { id: string; name: string; role: UserRole; organizationId: string };
  ip?: string;
}

/**
 * PRTS §13 lists a single `PUT /api/work-rules`, written when there was one
 * rule per organisation. Decision 2 made them named and plural, so this is the
 * ordinary resource shape instead. Anyone signed in may read their
 * organisation's rules — an employee is entitled to know their own hours —
 * and only administrators may change them.
 */
@ApiBearerAuth()
@Controller('work-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkRulesController {
  constructor(private readonly workRules: WorkRulesService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.workRules.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workRules.findOne(id, req.user.organizationId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  create(@Body() dto: CreateWorkRuleDto, @Req() req: AuthenticatedRequest) {
    return this.workRules.create(dto, req.user, req.ip);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkRuleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workRules.update(id, dto, req.user, req.ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workRules.remove(id, req.user, req.ip);
  }
}
