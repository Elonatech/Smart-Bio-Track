import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeController } from './office.controller';
import { OfficesService } from './office.service';

@Module({
  controllers: [OfficeController],
  providers: [OfficesService, PrismaService],
})
export class OfficesModule {}
