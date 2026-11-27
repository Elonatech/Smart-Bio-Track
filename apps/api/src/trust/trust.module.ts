import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustService } from './trust.service';

@Module({
  imports: [PrismaModule],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
