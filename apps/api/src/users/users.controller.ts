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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-users.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

interface AuthenticatedRequest {
  user: {
    id: string;
    /** Recorded as the actor's name on audit entries. */
    name: string;
    email: string;
    role: UserRole;
    organizationId: string;
    departmentId: string | null;
  };
  /**
   * Express's view of the client address. Behind a proxy this is the proxy
   * unless TRUST_PROXY_HOPS is set — see main.ts. Passed through to the audit
   * trail as-is, where it is nullable precisely because it is not always
   * trustworthy.
   */
  ip?: string;
}

@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  provision(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.provision(dto, req.user, req.ip);
  }

  // The role list here decides who may call this at all; it does not decide
  // what they get back. A TEAM_LEAD is admitted but sees only their own
  // department — that narrowing lives in the service, next to the data, so a
  // future endpoint cannot pick up the role check and miss the scope.
  // Paginated. `data` is { items, page, limit, total, totalPages } rather than a
  // bare array — a breaking change made deliberately, because the alternative
  // was an endpoint that returns however many users a customer happens to have.
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.TEAM_LEAD)
  findAll(@Query() query: ListUsersDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.findAll(req.user, query);
  }

  // Changes a staff record — name, role, department, office (#30).
  //
  // Same role list as provisioning, and for the same reason: whoever may create
  // an account may correct it. The ceiling on *which* users, and on which role
  // may be assigned, lives in the service where the target's own role is
  // visible — a controller decorator can only see the caller.
  //
  // Not PUT. A partial update is what admins actually do (reassign a
  // department, fix a spelling), and PUT would mean every caller resending
  // every field or silently clearing the ones they omitted.
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ResponseMessage('User updated.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(id, dto, req.user, req.ip);
  }

  // Brings a removed employee back (#23).
  //
  // SUPER_ADMIN only — a management decision of 24 Sep 2026, not a default.
  // Declared here *and* re-checked in the service: this decorator is the
  // documentation, and the service check is what still holds if a future route
  // reaches the same method.
  //
  // POST, not PATCH. This is not an edit to the record — it creates a new
  // activation token, wipes the old credential and starts the person over as
  // PENDING. A verb-ish sub-resource says that more honestly than a partial
  // update of a status field would.
  @Post(':id/reinstate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  reinstate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.reinstate(id, req.user, req.ip);
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
    return this.usersService.toggleStatus(id, req.user, req.ip);
  }

  // Issues a fresh activation link to a user still stuck in PENDING. Same role
  // list as provisioning: whoever may create an account may re-invite to it.
  //
  // Not throttled at the controller. @Throttle keys on client IP, which would
  // cap an admin chasing several new starters from one office; the limit that
  // matters is per recipient, and it lives in the service.
  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  resendInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.resendInvitation(id, req.user, req.ip);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.delete(id, req.user, req.ip);
  }
}
