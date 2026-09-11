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

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    $transaction: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  const mockMail = {
    sendOrganizationVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const user = {
      id: 'user-1',
      email: 'jane@example.com',
      passwordHash: 'hashed-pw',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    };

    it('throws on unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'nope@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
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
