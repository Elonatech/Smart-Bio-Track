import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  /** The refresh token to revoke. Omit when `all` is true. */
  @IsOptional()
  @IsString()
  refreshToken?: string;

  /** Revoke every active session for this user, not just the one supplied. */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
