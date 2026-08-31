import { IsNotEmpty, MinLength, IsEmail, Matches } from 'class-validator';
import { PASSWORD_REGEX } from '@smartbiotrack/constants';

export class CreatePendingOrganizationDto {
  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;
}
