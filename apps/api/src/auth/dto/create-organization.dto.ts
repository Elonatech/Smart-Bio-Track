import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { PASSWORD_REGEX } from '@smartbiotrack/constants';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, {
    message: 'Organization name must be at least 3 characters long',
  })
  organizationName: string;

  @IsString()
  @IsNotEmpty({}, { message: 'Admin employee ID is required' })
  adminEmployeeId: string;

  @IsString()
  @IsNotEmpty({}, { message: 'Admin name is required' })
  adminName: string;

  @IsEmail()
  @IsNotEmpty({}, { message: 'Email is required' })
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  confirmPassword: string;
}
