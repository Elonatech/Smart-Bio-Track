import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { OfficesModule } from './offices/office.module';

@Module({
  imports: [PrismaModule, AuthModule, DepartmentsModule, OfficesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
