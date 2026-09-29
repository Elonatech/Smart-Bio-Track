import { Module } from '@nestjs/common';
import { OfficeController } from './office.controller';
import { OfficesService } from './office.service';

@Module({
  controllers: [OfficeController],
  providers: [OfficesService],
})
export class OfficesModule {}
