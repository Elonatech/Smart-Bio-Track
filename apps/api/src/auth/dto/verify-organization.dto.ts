import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class VerifyOrganizationDto {
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, {
    message: 'Organization name must be at least 3 characters long',
  })
  organizationName: string;

  @IsString()
  @IsNotEmpty({ message: 'Admin name is required' })
  adminName: string;

  @IsString()
  @IsNotEmpty({ message: 'Industry is required' })
  industry: string;
}
