import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PunchLocationDto } from './punch-location.dto';

/**
 * A punch, from the website or the phone app (Phase 4 M3).
 *
 * The phone adds the one-time code it was issued (`challengeId`) and its
 * registered key's signature over it. The two come as a pair or not at all —
 * one without the other is a client bug. Without them the punch is a web
 * punch: recorded, and always flagged for HR (D14).
 */
export class PunchRequestDto extends PunchLocationDto {
  @ValidateIf(
    (o: PunchRequestDto) =>
      o.challengeId !== undefined || o.signature !== undefined,
  )
  @IsUUID()
  challengeId?: string;

  @ValidateIf(
    (o: PunchRequestDto) =>
      o.challengeId !== undefined || o.signature !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  signature?: string;
}
