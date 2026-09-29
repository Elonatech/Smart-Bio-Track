import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Exported so any module that needs to send mail can import MailModule and
 * inject MailService — starting with AuthModule.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
