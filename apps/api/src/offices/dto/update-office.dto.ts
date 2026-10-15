import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateOfficeDto } from './create-office.dto';

export class UpdateOfficeDto extends PartialType(CreateOfficeDto) {
  /**
   * The working-hours rule for this office's staff (Phase 3 decision 2).
   * `null` returns the office to the organisation's default rule.
   *
   * Only on update, not create: an office is created by the setup wizard before
   * any rule may exist. The service checks the rule belongs to the caller's
   * organisation — this DTO is spread straight into the update, so without
   * that check an admin could point their office at another tenant's rule.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  workRuleId?: string | null;
}
