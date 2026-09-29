import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt/jwt.strategy';
import { RolesGuard } from './roles.guard';
import { MailModule } from '../mail/mail.module';
// Sign-in can now produce an auditable event of its own: an account locked by
// repeated failed attempts (#9). Nobody performs it, which is exactly why it
// has to be recorded — there is no administrator to remember.
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MailModule,
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
