import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JWT_ACCESS_SECRET } from './jwt.contants';

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
      secretOrKey: JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
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
