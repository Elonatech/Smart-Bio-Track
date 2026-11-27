import { Injectable } from '@nestjs/common';
import { ChallengePurpose, PunchType } from '@prisma/client';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { verifyChallengeSignature } from '../devices/device-key';
import {
  decide,
  deviceSignal,
  geofenceSignal,
  integritySignal,
  networkSignal,
  replaySignal,
  velocitySignal,
  webSignal,
  type Signal,
  type TrustSettings,
  type TrustVerdict,
} from './trust-engine';

export interface TrustInput {
  userId: string;
  organizationId: string;
  type: PunchType;
  /** Both present = a phone punch; both absent = a web punch (DTO enforces). */
  challengeId?: string;
  signature?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  ipAddress?: string;
}

export interface TrustResult {
  verdict: TrustVerdict;
  source: 'MOBILE' | 'WEB';
  /** The phone that signed, when the signature checked out. */
  deviceId: string | null;
  /**
   * For a REJECTED phone attempt: the phone the code was issued to (even if
   * HR has since reset it, or the signature failed), else the caller's active
   * phone. The database requires a phone attempt to name one. Null when
   * nothing identifies a phone at all.
   */
  attemptDeviceId: string | null;
  /** The caller's address, normalised; null when it isn't a real address. */
  ipAddress: string | null;
  settings: TrustSettings;
}

/**
 * Gathers the facts the Trust Score Engine judges (Phase 4 M3) — the I/O half
 * of the engine. Every rule lives in trust-engine.ts; this only asks the
 * database questions and hands the answers over.
 *
 * Runs BEFORE the punch transaction: none of this needs the per-user lock,
 * and holding the lock across PostGIS and signature checks would only make a
 * second tap wait longer.
 */
@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: TrustInput): Promise<TrustResult> {
    const source = input.challengeId ? 'MOBILE' : 'WEB';
    const ipAddress = normaliseIp(input.ipAddress);
    const settings = await this.settingsFor(input.organizationId);

    const signals: Signal[] = [];
    let deviceId: string | null = null;
    let attemptDeviceId: string | null = null;

    if (source === 'MOBILE') {
      const identity = await this.checkPhone(input);
      deviceId = identity.deviceId;
      attemptDeviceId = identity.attemptDeviceId;
      signals.push(...identity.signals, integritySignal());
    } else {
      signals.push(webSignal());
    }

    const hasLocation =
      input.latitude !== undefined && input.longitude !== undefined;
    const [nearest, network, previous] = await Promise.all([
      hasLocation ? this.nearestOffice(input) : null,
      this.networkMatch(input.organizationId, ipAddress),
      hasLocation ? this.previousFix(input) : null,
    ]);

    signals.push(
      geofenceSignal(
        { accuracyMeters: input.accuracyMeters ?? null, nearest },
        settings,
      ),
      networkSignal({ ipAddress, ...network }),
      velocitySignal(previous, settings),
    );

    return {
      verdict: decide({
        type: input.type,
        source,
        policy: settings.locationPolicy,
        signals,
      }),
      source,
      deviceId,
      attemptDeviceId,
      ipAddress,
      settings,
    };
  }

  /**
   * Spends the one-time code, then checks the signature against the key of
   * the phone it was issued to.
   *
   * Spent first and on its own, exactly as at registration: a wrong signature
   * must not leave the code open for another try. Only codes for this user's
   * ACTIVE phone count — a code issued before HR reset the phone is dead.
   */
  private async checkPhone(input: TrustInput): Promise<{
    signals: Signal[];
    deviceId: string | null;
    attemptDeviceId: string | null;
  }> {
    const [active, issued] = await Promise.all([
      this.prisma.device.findFirst({
        where: { userId: input.userId, revokedAt: null },
        select: { id: true, publicKey: true },
      }),
      // Only this user's codes: someone else's code id must not even tell us
      // which phone it was for.
      this.prisma.deviceChallenge.findFirst({
        where: { id: input.challengeId, userId: input.userId },
        select: { deviceId: true },
      }),
    ]);

    const spent = await this.prisma.deviceChallenge.updateMany({
      where: {
        id: input.challengeId,
        userId: input.userId,
        purpose: ChallengePurpose.ATTENDANCE,
        deviceId: active?.id ?? '__none__',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    const codeAccepted = spent.count === 1;

    let signatureValid = false;
    if (codeAccepted && active) {
      const { challenge } = await this.prisma.deviceChallenge.findUniqueOrThrow(
        { where: { id: input.challengeId }, select: { challenge: true } },
      );
      signatureValid = verifyChallengeSignature(
        active.publicKey,
        challenge,
        input.signature ?? '',
      );
    }

    return {
      signals: [
        deviceSignal({
          hasActiveDevice: active !== null,
          signatureValid,
        }),
        replaySignal(codeAccepted),
      ],
      deviceId: signatureValid && active ? active.id : null,
      attemptDeviceId: issued?.deviceId ?? active?.id ?? null,
    };
  }

  private async settingsFor(organizationId: string): Promise<TrustSettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        locationPolicy: true,
        trustMaxAccuracyMeters: true,
        trustFenceMarginMeters: true,
        trustMaxSpeedKmh: true,
      },
    });
    return {
      locationPolicy: org.locationPolicy,
      maxAccuracyMeters: org.trustMaxAccuracyMeters,
      fenceMarginMeters: org.trustFenceMarginMeters,
      maxSpeedKmh: org.trustMaxSpeedKmh,
    };
  }

  /**
   * The organisation's office whose FENCE is nearest — distance minus radius,
   * so a small office 150 m away doesn't hide a large campus 200 m away that
   * the person is actually inside. PostGIS on geography (PRTS Module 4), so the
   * distance is metres on the earth's surface, not degrees.
   */
  private async nearestOffice(input: TrustInput) {
    const rows = await this.prisma.$queryRaw<
      { name: string; radiusMeters: number; distanceMeters: number }[]
    >`
      -- A subquery because Postgres lets ORDER BY name an output column on
      -- its own, but not use one inside an expression.
      SELECT name, "radiusMeters", "distanceMeters"
      FROM (
        SELECT name,
               "geofenceRadiusMeters" AS "radiusMeters",
               ST_Distance(
                 ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                 ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
               ) AS "distanceMeters"
        FROM "Office"
        WHERE "organizationId" = ${input.organizationId}
      ) offices
      ORDER BY "distanceMeters" - "radiusMeters"
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /**
   * Whether the caller's address falls in any of the organisation's office
   * ranges. Postgres does the containment (`<<=` on inet), which is exact for
   * IPv4 and IPv6 alike.
   */
  private async networkMatch(organizationId: string, ip: string | null) {
    const configured = await this.prisma.officeNetwork.count({
      where: { organizationId },
    });
    if (configured === 0 || !ip) {
      return { anyRangesConfigured: configured > 0, matchedOffice: null };
    }
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT o.name
      FROM "OfficeNetwork" n
      JOIN "Office" o ON o.id = n."officeId"
      WHERE n."organizationId" = ${organizationId}
        AND ${ip}::inet <<= n.cidr
      LIMIT 1
    `;
    return { anyRangesConfigured: true, matchedOffice: rows[0]?.name ?? null };
  }

  /** Distance and time since this person's last punch that had a location. */
  private async previousFix(input: TrustInput) {
    const rows = await this.prisma.$queryRaw<
      { distanceMeters: number; secondsAgo: number }[]
    >`
      SELECT ST_Distance(
               ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
             ) AS "distanceMeters",
             EXTRACT(EPOCH FROM (now() - "occurredAt"))::float AS "secondsAgo"
      FROM "PunchEvent"
      WHERE "userId" = ${input.userId}
        AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY "occurredAt" DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

/**
 * Express hands IPv4 callers over as "::ffff:1.2.3.4" on a dual-stack socket.
 * Stripped so an office range of 1.2.3.0/24 matches; anything that isn't a
 * real address becomes null rather than reaching an `::inet` cast.
 */
function normaliseIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return isIP(v4) ? v4 : null;
}
