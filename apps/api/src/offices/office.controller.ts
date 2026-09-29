import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { OfficesService } from './office.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: UserRole; organizationId: string };
}

@ApiBearerAuth()
@Controller('offices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OfficeController {
  constructor(private readonly officeService: OfficesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() createOfficeDto: CreateOfficeDto,
  ) {
    return this.officeService.create({
      ...createOfficeDto,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.officeService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.officeService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateOfficeDto: UpdateOfficeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.officeService.update(
      id,
      updateOfficeDto,
      req.user.organizationId,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.officeService.delete(id, req.user.organizationId);
  }
}
