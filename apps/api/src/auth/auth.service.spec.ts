import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    department: { findUnique: jest.fn() },
    office: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const registerDto = {
    employeeId: 'EMP001',
    name: 'Jane Doe',
    email: 'Jane@Example.com',
    organizationId: 'org-1',
    password: 'Passw0rd!',
    confirmPassword: 'Passw0rd!',
  };

  describe('register', () => {
    it('rejects mismatched passwords', async () => {
      await expect(
        service.register({ ...registerDto, confirmPassword: 'Other1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a duplicate employeeId', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'existing' }); // employeeId check

      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an invalid departmentId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.department.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.register({ ...registerDto, departmentId: 'bad-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalizes email, hashes password, and issues tokens on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        role: 'EMPLOYEE',
      });

      const result = await service.register(registerDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'jane@example.com' }),
        }),
      );
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });
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
        service.login({ email: 'nope@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws on suspended account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        status: 'SUSPENDED',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: user.email, password: 'Passw0rd!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: user.email,
        password: 'Passw0rd!',
      });

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
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
});
