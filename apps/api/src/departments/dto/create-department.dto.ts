import { IsString, MinLength } from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as string),
  )
  name!: string;
}
