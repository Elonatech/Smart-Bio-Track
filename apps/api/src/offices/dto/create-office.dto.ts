import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class CreateOfficeDto {
  @IsString()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as string),
  )
  name!: string;

  @IsNumber({}, { message: 'Latitude must be a number' })
  latitude!: number;

  @IsNumber({}, { message: 'Longitude must be a number' })
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  geofenceRadiusMeters?: number;
}
