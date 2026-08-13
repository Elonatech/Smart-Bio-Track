import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService, PrismaService],
})
export class OfficesModule {}
