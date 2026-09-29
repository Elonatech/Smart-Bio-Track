import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';

/**
 * Payload for `PATCH /users/:id` (#30).
 *
 * Every field is optional — this is a patch, and an admin changing a
 * department should not have to resend the name they are not touching.
 *
 * **Three fields are deliberately absent**, and each for its own reason:
 *
 * `email` — the login identifier. Changing it silently moves the account
 * somebody signs in with, and would need the same duplicate checks, the same
 * normalisation and almost certainly a confirmation to the old address before
 * it took effect. That is a feature, not a field.
 *
 * `employeeId` — the other login identifier, and the one printed on badges and
 * quoted in payroll. It is unique across the whole system, so changing it is a
 * collision risk as well as an identity one.
 *
 * `status` — `PATCH /users/:id/status` already owns suspension, and
 * `POST /users/:id/reinstate` owns coming back from removal. Accepting a
 * status here would be a second, unaudited route to both, and the quiet way to
 * set `DELETED` without any of the token revocation that `DELETE` performs.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be blank' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid role' })
  role?: UserRole;

  /**
   * `null` clears the assignment; omitting the key leaves it alone.
   *
   * The distinction is the whole reason this is not a plain `@IsOptional()
   * @IsUUID()`. Both columns are nullable, and "remove this person from their
   * department" is a real thing an admin needs to do — without an explicit
   * null there is no way to express it, and the field becomes write-once.
   *
   * `ValidateIf` skips the UUID check only when the value is exactly null, so
   * a stray empty string or a malformed id is still rejected rather than
   * quietly clearing the column.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  officeId?: string | null;
}
