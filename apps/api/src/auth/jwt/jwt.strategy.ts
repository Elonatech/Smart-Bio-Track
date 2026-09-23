import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { jwtAccessSecret } from './jwt.constants';
import type { MeResponse } from '@smartbiotrack/types';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Called here rather than read at import: the strategy is constructed
      // while Nest builds the module graph, which happens after bootstrap()
      // has validated the environment. See jwt.constants.ts.
      secretOrKey: jwtAccessSecret(),
    });
  }

  // The declared return type is the contract for GET /auth/me: the controller
  // hands `req.user` straight back, so whatever this builds *is* the response
  // body. Annotating it here means dropping a field, adding one, or changing a
  // type fails tsc in this app rather than surfacing as a blank name in the
  // browser three deploys later. See packages/types (#26).
  async validate(payload: JwtPayload): Promise<MeResponse> {
    // `department` is included, not just `departmentId`, because this is what
    // scopes a TEAM_LEAD's visibility (UsersService.visibleUsersWhere) *and*
    // what the dashboard labels their pages with. Both come from one LEFT JOIN
    // on a primary key here rather than a second round trip from the client.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true, department: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or inactive user');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name ?? null,
      // Nullable by schema — a TEAM_LEAD may not be assigned to a department
      // yet. Anything consuming this MUST treat null as "no scope", never as
      // a filter value. See visibleUsersWhere for why.
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    };
  }
}
