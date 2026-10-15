import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimeZone } from '../attendance/attendance-time';

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : (value as string);

@ValidatorConstraint({ name: 'ianaTimeZone' })
class IanaTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimeZone(value);
  }
  defaultMessage() {
    return 'timezone must be an IANA zone name, e.g. Africa/Lagos';
  }
}

/**
 * What the setup wizard's first step collects. The organisation itself is
 * created at /auth/verify-organization; this is the only way to change it
 * afterwards.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(80)
  industry?: string;

  /**
   * Decides which calendar day every punch belongs to and what "08:00" means
   * (Phase 3 decision 1). Validated against the zones Node actually knows,
   * because a misspelt zone would not fail here — it would fail on the first
   * clock-in, for everyone in the company.
   */
  @IsOptional()
  @Validate(IanaTimeZone)
  timezone?: string;
}
