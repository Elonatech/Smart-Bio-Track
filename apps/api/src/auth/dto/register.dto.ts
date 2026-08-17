import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { PASSWORD_REGEX } from '@smartbiotrack/constants';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({}, { message: 'Employee ID is required' })
  employeeId: string;

  @IsString()
  @IsNotEmpty({}, { message: 'Name is required' })
  name: string;

  @IsEmail()
  @IsNotEmpty({}, { message: 'Email is required' })
  email: string;

  @IsString()
  @IsNotEmpty({}, { message: 'Organization ID is required' })
  organizationId: string;

  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  confirmPassword: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid role' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;
}
