import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-users.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: UserRole; organizationId: string };
}

@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  provision(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.provision(
      dto,
      req.user.role,
      req.user.organizationId,
    );
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.TEAM_LEAD)
  findAll(@Req() req: AuthenticatedRequest) {
    return this.usersService.findAll(req.user.organizationId);
  }

  // Suspends an active user, or restores a suspended one. The role ceiling and
  // organization scoping live in the service, which is where the target's own
  // role can be seen.
  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ResponseMessage('User status updated.')
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.toggleStatus(id, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.delete(id, req.user);
  }
}
