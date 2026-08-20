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
