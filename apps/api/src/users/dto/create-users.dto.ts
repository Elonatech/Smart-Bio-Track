import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';

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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  employeeId: string;

  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email: string;

  @IsEnum(UserRole, { message: 'Invalid role' })
  role: UserRole;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;
}
