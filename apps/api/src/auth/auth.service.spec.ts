import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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

    it('throws on revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revoked: true,
        expiresAt: new Date(Date.now() + 10000),
        userId: 'user-1',
      });

      await expect(service.refresh('revoked')).rejects.toThrow(
        UnauthorizedException,
      );
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

    it('revokes the old token and issues a new pair', async () => {
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
      });

      const result = await service.refresh('valid-token');

      const lookup = mockPrisma.refreshToken.findUnique.mock.calls[0][0] as {
        where: { tokenHash: string };
      };
      expect(lookup.where.tokenHash).not.toBe('valid-token');
      expect(lookup.where.tokenHash).toHaveLength(64);

      const stored = mockPrisma.refreshToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(stored.data.tokenHash).not.toBe('signed-token');
      expect(stored.data.tokenHash).toHaveLength(64);

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revoked: true },
      });
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
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

      // resetToken is the temporary stand-in for emailing the link; it is
      // only present on the success path, hence the narrowing.
      const result = (await service.forgotPassword({
        email: 'jane@x.com',
      })) as { message: string; resetToken: string };

      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });

      const created = mockPrisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(created.data.tokenHash).not.toBe(result.resetToken);
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
