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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { HolidaysService } from './holidays.service';
import {
  CreateHolidayDto,
  ListHolidaysDto,
  UpdateHolidayDto,
} from './dto/holiday.dto';

interface AuthenticatedRequest {
  user: { id: string; name: string; role: UserRole; organizationId: string };
  ip?: string;
}

@ApiBearerAuth()
@Controller('holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  /** Everyone may see the calendar; only administrators may change it. */
  @Get()
  findAll(@Query() query: ListHolidaysDto, @Req() req: AuthenticatedRequest) {
    return this.holidays.findForYear(
      req.user.organizationId,
      query.year ?? new Date().getUTCFullYear(),
    );
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  create(@Body() dto: CreateHolidayDto, @Req() req: AuthenticatedRequest) {
    return this.holidays.create(dto, req.user, req.ip);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHolidayDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.holidays.update(id, dto, req.user, req.ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.holidays.remove(id, req.user, req.ip);
  }
}
