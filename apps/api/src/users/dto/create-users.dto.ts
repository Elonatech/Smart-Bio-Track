import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '@prisma/client';

/**
 * Payload an admin supplies when provisioning a user.
 *
 * Deliberately has no password field — the invitee sets their own via
 * POST /api/auth/complete-registration. `organizationId` is also absent: it
 * is taken from the authenticated caller's JWT so an admin cannot provision
 * a user into another organization.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID is required' })
  employeeId: string;

  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsEnum(UserRole, { message: 'Invalid role' })
  role: UserRole;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;
}
