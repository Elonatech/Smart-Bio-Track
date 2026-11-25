import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ChallengePurpose, DevicePlatform } from '@prisma/client';

/** `POST /devices/challenges` — what the code will be signed for. */
export class IssueChallengeDto {
  @IsEnum(ChallengePurpose)
  purpose!: ChallengePurpose;
}

/**
 * `POST /devices` — register this phone.
 *
 * `signature` is the new key's signature over the REGISTER challenge. It
 * proves the caller holds the private half of `publicKey`, so nobody can
 * register a key they copied from somewhere else.
 */
export class RegisterDeviceDto {
  @IsUUID()
  challengeId!: string;

  /** Base64 DER, X.509 SubjectPublicKeyInfo. RSA keys run ~400 characters. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  publicKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  signature!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  /** "Samsung Galaxy A54" — shown to HR, never trusted for anything. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

/** `POST /devices/:id/revoke` — why, for the record. */
export class RevokeDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

/** `GET /devices?userId=` — HR's view of one person's phones. */
export class ListDevicesDto {
  @IsUUID()
  userId!: string;
}
