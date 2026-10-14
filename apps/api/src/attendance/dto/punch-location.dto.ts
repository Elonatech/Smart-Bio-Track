import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Where the browser says the person is, sent with every punch (FR-010).
 *
 * Phase 3 decision 6: recorded, not enforced. The server does not refuse a
 * punch on location until Phase 4's geo-fence check, so every field is
 * optional — a browser that refuses location still clocks in. When a position
 * is sent, latitude and longitude come as a pair or not at all: one without
 * the other is a client bug, and a half-location is worse than none in the
 * audit trail Phase 4 will read.
 */
export class PunchLocationDto {
  @ValidateIf(
    (o: PunchLocationDto) =>
      o.longitude !== undefined || o.latitude !== undefined,
  )
  @IsLatitude()
  latitude?: number;

  @ValidateIf(
    (o: PunchLocationDto) =>
      o.latitude !== undefined || o.longitude !== undefined,
  )
  @IsLongitude()
  longitude?: number;

  /** The browser's own reported precision, in metres. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracyMeters?: number;
}
