import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { OfficesModule } from './offices/office.module';
import { UsersModule } from './users/users.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AuditModule } from './audit/audit.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkRulesModule } from './work-rules/work-rules.module';
import { HolidaysModule } from './holidays/holidays.module';
import { OrganizationModule } from './organization/organization.module';
import { THROTTLE_DEFAULT } from './common/throttle.config';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [THROTTLE_DEFAULT],
      // Default is "ThrottlerException: Too Many Requests", which leaks an
      // internal class name to the caller (PRTS §A11).
      errorMessage: 'Too many requests. Please try again shortly.',
      // Lets the integration tests turn throttling off. Every suite except
      // rate-limiting.e2e-spec needs it off, or they fail on unrelated 429s —
      // register-organization alone is capped at 3/hour and the counter is
      // per-process. Never set this outside the test environment.
      skipIf: () => process.env.DISABLE_RATE_LIMIT === 'true',
    }),
    PrismaModule,
    AuthModule,
    DepartmentsModule,
    OfficesModule,
    UsersModule,
    MaintenanceModule,
    AuditModule,
    // Registered here or its routes do not exist. Its first version was
    // written and unit-tested but never added to this list, so every route
    // 404'd — Departments and Offices were unreachable the same way in
    // Phase 2. e2e (attendance.e2e-spec.ts) now calls the real routes.
    AttendanceModule,
    WorkRulesModule,
    HolidaysModule,
    OrganizationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applied to every route. Sensitive endpoints tighten it further with
    // @Throttle({ auth: ... }); see common/throttle.config.ts.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
