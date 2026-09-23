import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      // Lockout uses updateMany for its conditional writes — "clear the lock
      // only if it has expired", "set the lock only if it is not already set" —
      // which is how two simultaneous attempts produce one lock instead of two.
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    department: { findUnique: jest.fn() },
    office: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    activationToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    pendingOrganizationSignup: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  // Sign-in writes one audit entry, and only one: the lockout. Every other
  // auth action is the account acting on itself, which the trail does not
  // record — it exists to say who did what to *someone else*.
  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockMail = {
    sendOrganizationVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountAlreadyExistsEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
    });
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: MailService, useValue: mockMail },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const user = {
      id: 'user-1',
      name: 'Jane Doe',
      employeeId: 'EMP-0001',
      organizationId: 'org-1',
      email: 'jane@example.com',
      passwordHash: 'hashed-pw',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      // Present and explicit, not omitted. Prisma returns null for both, and a
      // fixture that leaves them undefined makes `lockedUntil !== null` true
      // for every user — which would have the reset-on-success branch firing
      // in every test and passing anyway.
      failedLoginAttempts: 0,
      lockedUntil: null,
    };

    /** Fifteen minutes from now, i.e. a lock that is still in force. */
    const activeLock = () => new Date(Date.now() + 15 * 60_000);

    it('throws on unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'nope@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    // The three below are one guard: a refusal must cost the same whether or
    // not the account exists.
    //
    // They assert that argon2 runs, rather than measuring elapsed time. A
    // timing assertion would be the more direct test and a far worse one — it
    // fails on a loaded CI runner and passes on a fast laptop with the bug
    // present. What actually produces the timing difference is skipping
    // argon2, so that is what is pinned here.
    it('still verifies a password when no account matches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ identifier: 'nope@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      // Returning before this call is the oracle: a known identifier costs
      // ~100ms of argon2, an unknown one costs almost nothing, and an attacker
      // reads the difference from anywhere on the internet.
      expect(argon2.verify).toHaveBeenCalledTimes(1);
    });

    it('still verifies a password for an invited-but-not-activated account', async () => {
      // PENDING users have no passwordHash. Skipping argon2 here would say
      // "this address is registered but has never signed in" — arguably worse
      // than the unknown-account leak, since it identifies new starters.
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        status: 'PENDING',
        passwordHash: null,
      });
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ identifier: user.email, password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(argon2.verify).toHaveBeenCalledTimes(1);
    });

    it('never verifies against the real hash of another account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ identifier: 'nope@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      // The decoy is hashed from randomUUID at first use, so no caller can
      // supply the input that matches it — and it is never one of ours.
      const [hashUsed] = (argon2.verify as jest.Mock).mock.calls[0] as [
        unknown,
      ];
      expect(hashUsed).not.toBe(user.passwordHash);
    });

    it('throws on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ identifier: user.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws on suspended account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        status: 'SUSPENDED',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ identifier: user.email, password: 'Passw0rd!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    // Account lockout (#9). The limit IP throttling cannot express: a thousand
    // addresses each trying five passwords against one account never trips a
    // per-IP counter, because no single address misbehaves.
    describe('account lockout', () => {
      // The counter write is deliberately detached from the request so that a
      // failed sign-in costs one argon2 verify and nothing else — awaiting a
      // database round trip here would rebuild #19's timing oracle at lower
      // volume. These tests therefore let the microtask queue drain before
      // asserting, which is what `await Promise.resolve()` twice does.
      const settle = async () => {
        await Promise.resolve();
        await Promise.resolve();
      };

      /** The conditional write that sets the lock, if it was made. */
      const lockWrite = () =>
        mockPrisma.user.updateMany.mock.calls.find(
          (call) =>
            (call[0] as { data?: { lockedUntil?: unknown } }).data
              ?.lockedUntil instanceof Date,
        );

      it('increments the count rather than rewriting it', async () => {
        // `increment`, not read-then-write. Several failed sign-ins can be in
        // flight at once — this method runs detached from the request — and a
        // read-modify-write has every one of them read the same stale value
        // and write 1. The counter never climbs and the account never locks.
        //
        // An earlier version of this code did exactly that. These unit tests
        // passed, because a mocked Prisma returns whatever it is told; the e2e
        // suite against a real database is what caught it.
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 2 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
          }),
        );
      });

      it('locks the account at the threshold', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 5 });
        mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        const write = lockWrite();
        expect(write).toBeDefined();
        // Reset to zero, not left at five. Otherwise the next mistake after
        // the lock expires re-locks immediately, and a fifteen-minute lock
        // quietly becomes permanent for anyone still typing it wrong.
        expect((write![0] as { data: { failedLoginAttempts: number } }).data
          .failedLoginAttempts).toBe(0);
      });

      it('sets the lock only if it is not already set', async () => {
        // Two attempts crossing the threshold together must produce one lock
        // and one audit entry, not two of each.
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 5 });
        mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect((lockWrite()![0] as { where: { lockedUntil: null } }).where)
          .toEqual(expect.objectContaining({ lockedUntil: null }));
      });

      it('records the lockout in the audit trail', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 5 });
        mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'USER_LOCKED_OUT',
            // No actor: the system reacted, nobody acted.
            actor: null,
            targetId: user.id,
            targetLabel: 'Jane Doe (EMP-0001)',
          }),
          expect.anything(), // the transaction client
        );
      });

      it('writes no second audit entry when another attempt locked it first', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 6 });
        // count: 0 — the conditional write matched nothing, because the row was
        // already locked by whichever attempt got there first.
        mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockAudit.record).not.toHaveBeenCalled();
      });

      it('writes no audit entry for a failure below the threshold', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        mockPrisma.user.update.mockResolvedValue({ failedLoginAttempts: 2 });

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockAudit.record).not.toHaveBeenCalled();
        expect(lockWrite()).toBeUndefined();
      });

      it('refuses a locked account even with the right password', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          ...user,
          lockedUntil: activeLock(),
        });
        (argon2.verify as jest.Mock).mockResolvedValue(true);

        await expect(
          service.login({ identifier: user.email, password: 'Passw0rd!' }),
        ).rejects.toThrow('Too many failed attempts. Try again in a few minutes.');
      });

      it('does not clear the lock when the right password arrives', async () => {
        // Clearing it would make the lock bypassable by the one attacker who
        // has already guessed correctly.
        mockPrisma.user.findUnique.mockResolvedValue({
          ...user,
          lockedUntil: activeLock(),
        });
        (argon2.verify as jest.Mock).mockResolvedValue(true);

        await expect(
          service.login({ identifier: user.email, password: 'Passw0rd!' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('does not extend the lock while it is in force', async () => {
        // Nor should a wrong password during a lockout keep pushing the expiry
        // outward — that turns a persistent attacker into an indefinite one.
        mockPrisma.user.findUnique.mockResolvedValue({
          ...user,
          lockedUntil: activeLock(),
        });
        (argon2.verify as jest.Mock).mockResolvedValue(false);

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('says only "invalid credentials" to a wrong password on a locked account', async () => {
        // The lock is revealed *after* a correct password and never before.
        // Announcing it to anyone who guesses wrong would say "this address is
        // real and under attack" — enumeration, rebuilt from the other end.
        mockPrisma.user.findUnique.mockResolvedValue({
          ...user,
          lockedUntil: activeLock(),
        });
        (argon2.verify as jest.Mock).mockResolvedValue(false);

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow('Invalid credentials');
      });

      it('lets a lapsed lock through and starts the count again', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({
          ...user,
          failedLoginAttempts: 3,
          lockedUntil: new Date(Date.now() - 60_000), // expired a minute ago
        });
        (argon2.verify as jest.Mock).mockResolvedValue(true);
        (argon2.needsRehash as jest.Mock).mockReturnValue(false);

        const result = await service.login({
          identifier: user.email,
          password: 'Passw0rd!',
        });

        expect(result).toHaveProperty('accessToken');
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      });

      it('does not write on a clean successful sign-in', async () => {
        // Nothing to clear. Without this guard every sign-in in the product
        // writes to the users table for no reason.
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(true);
        (argon2.needsRehash as jest.Mock).mockReturnValue(false);

        await service.login({ identifier: user.email, password: 'Passw0rd!' });

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('never counts a failure against an account that does not exist', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        (argon2.verify as jest.Mock).mockResolvedValue(false);

        await expect(
          service.login({ identifier: 'nobody@example.com', password: 'x' }),
        ).rejects.toThrow(UnauthorizedException);
        await settle();

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });
    });

    // Upgrading old hashes. Without this, changing the hashing parameters
    // applies only to accounts created afterwards, and everyone already
    // registered keeps their original cost for life.
    describe('rehashing on sign-in', () => {
      it('re-hashes a password stored with older settings', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(true);
        (argon2.needsRehash as jest.Mock).mockReturnValue(true);
        (argon2.hash as jest.Mock).mockResolvedValue('rehashed-pw');

        await service.login({ identifier: user.email, password: 'Passw0rd!' });

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: user.id },
          data: { passwordHash: 'rehashed-pw' },
        });
      });

      it('leaves a current hash alone', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(true);
        (argon2.needsRehash as jest.Mock).mockReturnValue(false);

        await service.login({ identifier: user.email, password: 'Passw0rd!' });

        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('signs the user in anyway if the re-hash fails', async () => {
        // The user is who they say they are. Failing a valid sign-in over an
        // optimisation would turn a database hiccup into an outage.
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(true);
        (argon2.needsRehash as jest.Mock).mockReturnValue(true);
        (argon2.hash as jest.Mock).mockResolvedValue('rehashed-pw');
        // `Once`, not a standing rejection. `jest.clearAllMocks()` in
        // beforeEach clears recorded calls but NOT implementations, so a
        // permanent mockRejectedValue here leaks into every later test that
        // touches user.update — which nothing did until lockout added a write
        // to the successful sign-in path, at which point an unrelated test
        // started failing with "db down".
        mockPrisma.user.update.mockRejectedValueOnce(new Error('db down'));

        await expect(
          service.login({ identifier: user.email, password: 'Passw0rd!' }),
        ).resolves.toEqual({
          accessToken: 'signed-token',
          refreshToken: 'signed-token',
        });
      });

      it('never re-hashes when the password was wrong', async () => {
        // This runs after the verify on purpose. Doing it earlier would make a
        // refusal cost more for real accounts than unknown ones, which is #19
        // reopened from the other side.
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (argon2.verify as jest.Mock).mockResolvedValue(false);
        (argon2.needsRehash as jest.Mock).mockReturnValue(true);

        await expect(
          service.login({ identifier: user.email, password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);

        // Specifically no *rehash*. A failed sign-in does now write to this
        // table — the lockout counter — so "update was never called" is no
        // longer the right assertion and would pass for the wrong reason.
        const rehashed = mockPrisma.user.update.mock.calls.some(
          (call) =>
            (call[0] as { data?: { passwordHash?: string } }).data
              ?.passwordHash !== undefined,
        );
        expect(rehashed).toBe(false);
      });
    });

    it('issues tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        identifier: user.email,
        password: 'Passw0rd!',
      });

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
    });

    it('looks up by email when the identifier contains an @', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await service.login({ identifier: 'JANE@Example.com', password: 'x' });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
    });

    it('looks up by employeeId when the identifier has no @', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await service.login({ identifier: 'EMP001', password: 'x' });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { employeeId: 'EMP001' },
      });
    });

    it('rejects a DELETED user even with the correct password', async () => {
      // The guard here used to ask "is the status SUSPENDED?", which answers
      // no for every status invented afterwards — so adding DELETED to the
      // enum silently let removed employees sign back in. It now asks "is the
      // status ACTIVE?", which refuses anything new by default.
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        status: 'DELETED',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ identifier: user.email, password: 'Passw0rd!' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a PENDING user who has never set a password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        passwordHash: null,
        status: 'PENDING',
      });

      await expect(
        service.login({ identifier: user.email, password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createPendingOrganization', () => {
    // This endpoint is public, unauthenticated, and had no unit tests at all
    // until #13a — while answering "already exists" differently from "free",
    // which is the whole enumeration oracle.
    const dto = { email: 'New@Acme.test', password: 'Passw0rd!' };

    const noOneHasThisEmail = () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.pendingOrganizationSignup.upsert.mockResolvedValue({
        id: 'pending-1',
      });
    };

    beforeEach(() => {
      noOneHasThisEmail();
    });

    it('sends a verification link when the address is free', async () => {
      const result = await service.createPendingOrganization(dto);

      expect(mockMail.sendOrganizationVerificationEmail).toHaveBeenCalled();
      expect(mockMail.sendAccountAlreadyExistsEmail).not.toHaveBeenCalled();
      expect(result.message).toMatch(/check your email/i);
    });

    it.each([
      ['an organization', 'organization'],
      ['a user', 'user'],
    ])('answers identically when %s already holds the address', async (_label, owner) => {
      const free = await service.createPendingOrganization(dto);

      jest.clearAllMocks();
      noOneHasThisEmail();
      mockPrisma[owner as 'organization' | 'user'].findUnique.mockResolvedValue({
        id: 'existing-1',
      });

      const taken = await service.createPendingOrganization(dto);

      // Identical response objects — any difference at all is enough to
      // enumerate which addresses have accounts here.
      expect(taken).toEqual(free);
    });

    it('writes nothing and sends no verification link when the address is taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-1' });

      await service.createPendingOrganization(dto);

      // A second signup must not be able to start over an address somebody
      // already owns — no pending row, and no link that would let them.
      expect(mockPrisma.pendingOrganizationSignup.upsert).not.toHaveBeenCalled();
      expect(mockMail.sendOrganizationVerificationEmail).not.toHaveBeenCalled();
      expect(mockMail.sendAccountAlreadyExistsEmail).toHaveBeenCalledWith(
        'new@acme.test',
      );
    });

    it('still answers normally when the notice email fails to send', async () => {
      // A 500 here would be the oracle in reverse: taken returns 200, so an
      // error would mean "that address was free".
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-1' });
      mockMail.sendAccountAlreadyExistsEmail.mockRejectedValueOnce(
        new Error('brevo down'),
      );

      await expect(
        service.createPendingOrganization(dto),
      ).resolves.toMatchObject({ message: expect.any(String) });
    });

    it('still answers normally when the verification email fails to send', async () => {
      mockMail.sendOrganizationVerificationEmail.mockRejectedValueOnce(
        new Error('brevo down'),
      );

      await expect(
        service.createPendingOrganization(dto),
      ).resolves.toMatchObject({ message: expect.any(String) });

      // The pending row stays. It used to be deleted so a retry would not trip
      // a "verification already sent" check that no longer exists — the upsert
      // simply reissues now.
      expect(mockPrisma.pendingOrganizationSignup.delete).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('throws on unknown token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('missing')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws on a token revoked without rotation, and spares the family', async () => {
      // rotatedAt null = ended on purpose (sign-out, suspension, reset). A
      // stale tab replaying it is unremarkable, so the rest of the session
      // must not be torn down over it.
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revoked: true,
        rotatedAt: null,
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 10000),
        userId: 'user-1',
      });

      await expect(service.refresh('revoked')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws on expired token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revoked: false,
        expiresAt: new Date(Date.now() - 10000),
        userId: 'user-1',
      });

      await expect(service.refresh('expired')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses to rotate the token of a suspended user', async () => {
      // JwtStrategy would reject the access token this returns, so issuing one
      // means a 200 followed immediately by a 401 on the next request.
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 10000),
        userId: 'user-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        role: 'EMPLOYEE',
        status: 'SUSPENDED',
      });

      await expect(service.refresh('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the old token and issues a new pair', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revoked: false,
        rotatedAt: null,
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 10000),
        userId: 'user-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      });

      const result = await service.refresh('valid-token');

      const lookup = mockPrisma.refreshToken.findUnique.mock.calls[0][0] as {
        where: { tokenHash: string };
      };
      expect(lookup.where.tokenHash).not.toBe('valid-token');
      expect(lookup.where.tokenHash).toHaveLength(64);

      const stored = mockPrisma.refreshToken.create.mock.calls[0][0] as {
        data: { tokenHash: string; familyId: string };
      };
      expect(stored.data.tokenHash).not.toBe('signed-token');
      expect(stored.data.tokenHash).toHaveLength(64);
      // Carried forward, not regenerated: theft detection needs the chain from
      // sign-in onwards to stay identifiable as one session.
      expect(stored.data.familyId).toBe('fam-1');

      const update = mockPrisma.refreshToken.update.mock.calls[0][0] as {
        where: { id: string };
        data: { revoked: boolean; rotatedAt: Date };
      };
      expect(update.where).toEqual({ id: 'rt-1' });
      expect(update.data.revoked).toBe(true);
      // Stamped, not just revoked. Without this the replay below is
      // indistinguishable from a deliberate sign-out and theft goes unnoticed.
      expect(update.data.rotatedAt).toBeInstanceOf(Date);

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
    });
  });

  describe('refresh token reuse', () => {
    const activeUser = {
      id: 'user-1',
      email: 'jane@example.com',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    };

    /** A token spent (rotated) `secondsAgo` seconds ago. */
    const rotatedToken = (secondsAgo: number) => ({
      id: 'rt-1',
      revoked: true,
      rotatedAt: new Date(Date.now() - secondsAgo * 1000),
      familyId: 'fam-1',
      expiresAt: new Date(Date.now() + 10_000),
      userId: 'user-1',
    });

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      // Default: spent five seconds ago, comfortably inside the window. The
      // theft cases below override this with a token spent long ago.
      mockPrisma.refreshToken.findUnique.mockResolvedValue(rotatedToken(5));
    });

    it('accepts a replay inside the grace window', async () => {
      // Two tabs opening together send the same cookie microseconds apart. The
      // second must not be punished for the first having rotated it.
      const result = await service.refresh('raced-token');

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('gives the raced caller a token in the same family', async () => {
      await service.refresh('raced-token');

      const created = mockPrisma.refreshToken.create.mock.calls[0][0] as {
        data: { familyId: string };
      };
      expect(created.data.familyId).toBe('fam-1');
    });

    it('does not re-stamp rotatedAt on a replay', async () => {
      // Re-stamping would slide the window forward on every replay, so an
      // attacker polling once every 20 seconds could keep a stolen token alive
      // forever and never trip detection.
      await service.refresh('raced-token');

      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('treats a replay after the grace window as theft', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(rotatedToken(120));

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('revokes the whole family when reuse is detected', async () => {
      // The point of the feature. Refusing just this request would leave the
      // thief's freshly minted token working — they rotated successfully a
      // moment ago, which is exactly why this one came back spent.
      mockPrisma.refreshToken.findUnique.mockResolvedValue(rotatedToken(120));

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revoked: false },
        data: { revoked: true },
      });
    });

    it('issues nothing to the replayer', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(rotatedToken(120));

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('scopes the revocation to one session, not every device', async () => {
      // Signing someone out of their phone because a laptop session was
      // replayed is a worse experience than the threat warrants — the other
      // families were never exposed.
      mockPrisma.refreshToken.findUnique.mockResolvedValue(rotatedToken(120));

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );

      const where = (
        mockPrisma.refreshToken.updateMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(where).toHaveProperty('familyId');
      expect(where).not.toHaveProperty('userId');
    });
  });

  describe('session families', () => {
    it('starts a distinct family per sign-in', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        passwordHash: 'hashed-pw',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const credentials = {
        identifier: 'jane@example.com',
        password: 'correct-horse',
      };

      await service.login(credentials);
      await service.login(credentials);

      const [first, second] = mockPrisma.refreshToken.create.mock.calls.map(
        (call) => (call[0] as { data: { familyId: string } }).data.familyId,
      );

      // Sharing a family across sign-ins would mean one replayed token ends
      // every session the user has, on every device.
      expect(first).not.toBe(second);
    });
  });

  describe('completeRegistration', () => {
    const validDto = {
      token: 'raw-activation-token',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
    };

    const pendingToken = {
      id: 'act-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 10000),
      user: { id: 'user-1', status: 'PENDING' },
    };

    it('rejects mismatched passwords', async () => {
      await expect(
        service.completeRegistration({
          ...validDto,
          confirmPassword: 'Other1!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue(null);

      await expect(service.completeRegistration(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an already-used token', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue({
        ...pendingToken,
        usedAt: new Date(),
      });

      await expect(service.completeRegistration(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue({
        ...pendingToken,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(service.completeRegistration(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a token whose user is already ACTIVE', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue({
        ...pendingToken,
        user: { id: 'user-1', status: 'ACTIVE' },
      });

      await expect(service.completeRegistration(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('looks the token up by hash, not by its raw value', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue(null);

      await expect(service.completeRegistration(validDto)).rejects.toThrow(
        BadRequestException,
      );

      const arg = mockPrisma.activationToken.findUnique.mock.calls[0][0] as {
        where: { tokenHash: string };
      };
      expect(arg.where.tokenHash).not.toBe(validDto.token);
      expect(arg.where.tokenHash).toHaveLength(64); // sha256 hex
    });

    it('activates the user, burns the token, and issues tokens', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue(pendingToken);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'bob@example.com',
        role: 'EMPLOYEE',
      });

      const result = await service.completeRegistration(validDto);

      const userUpdate = mockPrisma.user.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(userUpdate.data.status).toBe('ACTIVE');
      expect(userUpdate.data.passwordHash).toBe('hashed-pw');

      const tokenUpdate = mockPrisma.activationToken.update.mock
        .calls[0][0] as { data: { usedAt: Date } };
      expect(tokenUpdate.data.usedAt).toEqual(expect.any(Date));

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
    });
  });
  describe('logout', () => {
    it('revokes the supplied refresh token when it belongs to the caller', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revoked: false,
      });

      const result = await service.logout('user-1', { refreshToken: 'abc' });

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revoked: true },
      });
      expect(result).toEqual({ message: 'Signed out' });
    });

    it("refuses to revoke another user's refresh token", async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'someone-else',
        revoked: false,
      });

      await expect(
        service.logout('user-1', { refreshToken: 'abc' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.logout('user-1', { refreshToken: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a refreshToken unless all is true', async () => {
      await expect(service.logout('user-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('revokes every active session when all is true', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.logout('user-1', { all: true });

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true },
      });
      expect(result).toEqual({ message: 'Signed out of 3 session(s)' });
    });
  });

  describe('deleteAccount', () => {
    it('marks the account deleted rather than removing the row', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        status: 'ACTIVE',
      });

      const result = await service.deleteAccount('user-1');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      // Attendance and pay records hang off this row. Nobody gets to delete
      // their way out of a payroll dispute.
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();

      const update = mockPrisma.user.update.mock.calls[0][0] as {
        data: { status: string; deletedAt: Date };
      };
      expect(update.data.status).toBe('DELETED');
      expect(update.data.deletedAt).toBeInstanceOf(Date);
      expect(result.message).toMatch(/Account deleted/);
    });

    it('revokes every live way back into the account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        status: 'ACTIVE',
      });

      await service.deleteAccount('user-1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true },
      });
      expect(mockPrisma.activationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('refuses to delete an account that is already deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'DELETED',
      });

      await expect(service.deleteAccount('user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('throws when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('unknown-id')).rejects.toThrow(
        UnprocessableEntityException,
      );

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    const activeUser = { id: 'user-1', status: 'ACTIVE' };

    it('returns the same message for an unknown email, and issues no token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'nobody@x.com' });

      expect(result.message).toMatch(/If an account exists/);
      expect(result).not.toHaveProperty('resetToken');
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('issues no token for a PENDING user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        status: 'PENDING',
      });

      const result = await service.forgotPassword({ email: 'pending@x.com' });

      expect(result).not.toHaveProperty('resetToken');
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('stores only a hash and invalidates any earlier unused token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.forgotPassword({ email: 'jane@x.com' });

      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });

      // The raw token now leaves only through the email.
      const emailed = mockMail.sendPasswordResetEmail.mock
        .calls[0][1] as string;

      const created = mockPrisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(created.data.tokenHash).not.toBe(emailed);
      expect(created.data.tokenHash).toHaveLength(64);
    });
  });

  describe('resetPassword', () => {
    const validDto = {
      token: 'raw-reset-token',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
    };

    const liveToken = {
      id: 'prt-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 10000),
    };

    it('rejects mismatched passwords', async () => {
      await expect(
        service.resetPassword({ ...validDto, confirmPassword: 'Other1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an already-used token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        ...liveToken,
        usedAt: new Date(),
      });

      await expect(service.resetPassword(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        ...liveToken,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(service.resetPassword(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets the password, burns the token, and revokes every session', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken);
      (argon2.hash as jest.Mock).mockResolvedValue('new-hash');

      const result = await service.resetPassword(validDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hash' },
      });
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true },
      });
      expect(result.message).toMatch(/Password has been reset/);
    });
  });
});
