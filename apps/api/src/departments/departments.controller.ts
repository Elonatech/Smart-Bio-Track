import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UserRole } from '@prisma/client';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: UserRole; organizationId: string };
}

@ApiBearerAuth()
@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Roles(UserRole.HR_ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body() createDepartmentDto: CreateDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.departmentsService.create(
      createDepartmentDto,
      req.user.organizationId,
    );
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.departmentsService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.departmentsService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.departmentsService.update(
      id,
      updateDepartmentDto,
      req.user.organizationId,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.departmentsService.remove(id, req.user.organizationId);
  }
}
