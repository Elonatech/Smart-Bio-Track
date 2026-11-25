import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChallengePurpose, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditAction } from '../audit/audit.service';
import { ATTENDANCE_EXEMPT_ROLES } from '../attendance/attendance-rules';
import { ROLE_AUTHORITY_MATRIX } from '../users/users.service';
import { ROLE_LABEL_PLURAL } from '../common/role-labels';
import {
  InvalidPublicKeyError,
  newChallenge,
  parsePublicKey,
  verifyChallengeSignature,
} from './device-key';
import type {
  IssueChallengeDto,
  RegisterDeviceDto,
  RevokeDeviceDto,
} from './dto/device.dto';

export interface DeviceCaller {
  id: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

/**
 * How long a challenge stays signable (plan §5). Long enough for a person to
 * find their finger; short enough that a stolen code is stale before it's
 * useful. The free-tier cold start happens before the code is issued, so it
 * doesn't eat into this.
 */
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;

const DEVICE_SELECT = {
  id: true,
  platform: true,
  label: true,
  keyAlgorithm: true,
  registeredAt: true,
  revokedAt: true,
  revokeReason: true,
} satisfies Prisma.DeviceSelect;

/**
 * Registered phones (Phase 4 M2): the binding between an employee and the
 * one phone that may sign their attendance (D4).
 *
 * Every query is scoped to the caller's organisation, and the employee-facing
 * routes act on the caller only — there is no `:userId` for an employee to
 * change into someone else's.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A one-time code for the phone to sign.
   *
   * REGISTER needs no device yet. ATTENDANCE is always for the caller's active
   * device — the punch routes in M3 verify against it.
   */
  async issueChallenge(caller: DeviceCaller, dto: IssueChallengeDto) {
    this.assertTracked(caller);

    let deviceId: string | null = null;
    if (dto.purpose === ChallengePurpose.ATTENDANCE) {
      const device = await this.activeDevice(caller.id);
      if (!device) {
        throw new BadRequestException(
          'Register this phone before clocking in with it.',
        );
      }
      deviceId = device.id;
    }

    const row = await this.prisma.deviceChallenge.create({
      data: {
        userId: caller.id,
        deviceId,
        purpose: dto.purpose,
        challenge: newChallenge(),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
      select: { id: true, challenge: true, expiresAt: true },
    });
    return row;
  }

  /**
   * Binds a phone to the caller.
   *
   * The order matters:
   *   1. Spend the challenge — and commit that, on its own. A failed signature
   *      below must not leave the code reusable, or the same code could be
   *      tried again and again.
   *   2. Check the key is one we accept, and that it signed the code: proof
   *      the caller holds the private half, not just a copy of a public key.
   *   3. Create the device and its audit entry in one transaction. A second
   *      active phone is refused by the database's partial unique index (D4),
   *      so two simultaneous registrations can't both win.
   */
  async register(caller: DeviceCaller, dto: RegisterDeviceDto, ip?: string) {
    this.assertTracked(caller);

    const spent = await this.prisma.deviceChallenge.updateMany({
      where: {
        id: dto.challengeId,
        userId: caller.id,
        purpose: ChallengePurpose.REGISTER,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (spent.count !== 1) {
      // One message for unknown, someone else's, used and expired alike:
      // telling them apart helps nobody but someone probing.
      throw new BadRequestException(
        'This registration code is invalid or has expired. Request a new one.',
      );
    }

    let algorithm: string;
    try {
      algorithm = parsePublicKey(dto.publicKey).algorithm;
    } catch (e) {
      if (e instanceof InvalidPublicKeyError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    const { challenge } = await this.prisma.deviceChallenge.findUniqueOrThrow({
      where: { id: dto.challengeId },
      select: { challenge: true },
    });
    if (!verifyChallengeSignature(dto.publicKey, challenge, dto.signature)) {
      throw new BadRequestException(
        'The signature does not match this key. Request a new code and try again.',
      );
    }

    if (await this.activeDevice(caller.id)) {
      throw this.alreadyRegistered();
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const device = await tx.device.create({
          data: {
            organizationId: caller.organizationId,
            userId: caller.id,
            platform: dto.platform,
            publicKey: dto.publicKey.replace(/\s+/g, ''),
            keyAlgorithm: algorithm,
            label: dto.label ?? null,
          },
          select: DEVICE_SELECT,
        });
        await this.record(
          tx,
          caller,
          'DEVICE_REGISTERED',
          device.id,
          `${caller.name}: ${deviceName(device)}`,
          ip,
        );
        return device;
      });
    } catch (e) {
      // The partial unique index (one active device) or the unique public key.
      // Detected by error code alone: Prisma 7's P2002 `meta.target` is not a
      // field list (Phase 3 lesson), and both cases mean the same thing here.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw this.alreadyRegistered();
      }
      throw e;
    }
  }

  /** The caller's active phone, or null. */
  async mine(caller: DeviceCaller) {
    return this.prisma.device.findFirst({
      where: { userId: caller.id, revokedAt: null },
      select: DEVICE_SELECT,
    });
  }

  /**
   * One person's phones, newest first, revoked ones included — HR needs the
   * history ("which phone did they use in March?"), not just today's.
   */
  async listForUser(caller: DeviceCaller, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: caller.organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.device.findMany({
      where: { userId, organizationId: caller.organizationId },
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
      select: DEVICE_SELECT,
    });
  }

  /**
   * Releases a phone: lost, replaced, or left with someone else. The row is
   * kept — punches point at the device that signed them — and the employee can
   * then register a new one.
   *
   * Who may revoke whose phone follows the same authority as managing staff:
   * HR Managers for Team Leads and Employees; Organization Owners for anyone.
   */
  async revoke(
    caller: DeviceCaller,
    deviceId: string,
    dto: RevokeDeviceDto,
    ip?: string,
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, organizationId: caller.organizationId },
      select: {
        ...DEVICE_SELECT,
        user: { select: { name: true, role: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');

    if (
      !(ROLE_AUTHORITY_MATRIX[caller.role] ?? []).includes(device.user.role)
    ) {
      throw new ForbiddenException(
        `${ROLE_LABEL_PLURAL[caller.role]} can't reset ${ROLE_LABEL_PLURAL[device.user.role]}' phones.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional on still being active, so two HR managers revoking at once
      // produce one revocation and one clear refusal, not two audit entries.
      const { count } = await tx.device.updateMany({
        where: { id: deviceId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedById: caller.id,
          revokeReason: dto.reason,
        },
      });
      if (count !== 1) {
        throw new ConflictException('This phone has already been reset.');
      }

      await this.record(
        tx,
        caller,
        'DEVICE_REVOKED',
        deviceId,
        `${device.user.name}: ${deviceName(device)} (${dto.reason})`,
        ip,
      );

      return tx.device.findUniqueOrThrow({
        where: { id: deviceId },
        select: DEVICE_SELECT,
      });
    });
  }

  private activeDevice(userId: string) {
    return this.prisma.device.findFirst({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
  }

  /** Organisation owners don't clock in (27 Oct), so they have no phone to bind. */
  private assertTracked(caller: DeviceCaller) {
    if (ATTENDANCE_EXEMPT_ROLES.includes(caller.role)) {
      throw new ForbiddenException(
        `${ROLE_LABEL_PLURAL[caller.role]} don't record attendance, so there is no phone to register.`,
      );
    }
  }

  private alreadyRegistered() {
    return new ConflictException(
      'A phone is already registered to your account. Ask HR to reset it before registering a new one.',
    );
  }

  private record(
    tx: Prisma.TransactionClient,
    caller: DeviceCaller,
    action: AuditAction,
    deviceId: string,
    label: string,
    ip?: string,
  ) {
    return this.audit.record(
      {
        organizationId: caller.organizationId,
        actor: { id: caller.id, name: caller.name, role: caller.role },
        action,
        targetType: 'Device',
        targetId: deviceId,
        targetLabel: label,
        ipAddress: ip,
      },
      tx,
    );
  }
}

function deviceName(device: { label: string | null; platform: string }) {
  return (
    device.label ?? `${device.platform === 'IOS' ? 'iPhone' : 'Android'} phone`
  );
}
