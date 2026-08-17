import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty({}, { message: 'Email is required' })
  email: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty({}, { message: 'Password is required' })
  password: string;
}
