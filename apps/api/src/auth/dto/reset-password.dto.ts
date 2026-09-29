import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_REGEX } from '@smartbiotrack/constants';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;

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
