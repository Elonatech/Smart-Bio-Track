import { PartialType } from '@nestjs/mapped-types';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { OvertimeBasis } from '@prisma/client';

/** "08:00" — 24-hour, always two digits each side, as the screens send it. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A working-hours rule, in the units people use: "08:00", minutes of grace.
 *
 * The database stores minutes after midnight (480 for 08:00) so it can
 * enforce start < end itself; the service converts at the edge, so nothing
 * outside it ever handles that representation.
 */
export class CreateWorkRuleDto {
  @IsString()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as string),
  )
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one working day' })
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays!: number[];

  @Matches(CLOCK_TIME, { message: 'startTime must be a time like 08:00' })
  startTime!: string;

  @Matches(CLOCK_TIME, { message: 'endTime must be a time like 17:00' })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  gracePeriodMinutes?: number;

  /**
   * How overtime is counted: END_TIME (after the end time — the default),
   * DAILY_HOURS (beyond overtimeAfterMinutes worked) or NONE.
   */
  @IsOptional()
  @IsEnum(OvertimeBasis)
  overtimeBasis?: OvertimeBasis;

  /**
   * For DAILY_HOURS: worked minutes in a day after which the rest is
   * overtime. Sent without a basis, it means DAILY_HOURS (and null means
   * NONE) — how this field worked before the basis existed.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1440)
  overtimeAfterMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  overtimeMultiplier?: number;

  /**
   * Make this the organisation's default. The first rule an organisation
   * creates becomes the default whatever this says — an organisation with
   * rules but no default would judge nobody.
   */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateWorkRuleDto extends PartialType(CreateWorkRuleDto) {}
