import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * PRTS FR-001: authentication accepts an Employee ID *or* an email address.
 *
 * Both arrive in a single `identifier` field — which one it is gets decided by
 * whether it contains an "@", not by the client telling us. A separate
 * `email` / `employeeId` pair would let a caller claim one and send the other.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID or email is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  identifier: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
