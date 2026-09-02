import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
