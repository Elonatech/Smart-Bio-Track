import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: UserRole; organizationId: string };
}

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
}
