import { PartialType } from '@nestjs/mapped-types';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HolidayType } from '@prisma/client';

const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateHolidayDto {
  @IsString()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as string),
  )
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** A calendar date in the organisation's timezone, "YYYY-MM-DD". */
  @Matches(LOCAL_DATE, { message: 'date must be a date like 2026-10-01' })
  date!: string;

  @IsOptional()
  @IsEnum(HolidayType)
  type?: HolidayType;

  /**
   * Same month and day every year (New Year's Day). Leave false for holidays
   * that move — Eid, Easter — which have to be entered each year.
   */
  @IsOptional()
  @IsBoolean()
  repeatsAnnually?: boolean;
}

export class UpdateHolidayDto extends PartialType(CreateHolidayDto) {}

export class ListHolidaysDto {
  /** Defaults to the current year. Annual holidays appear in every year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
