import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  const orgId = 'org-1';

  const mockPrisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    department: { findFirst: jest.fn() },
    office: { findFirst: jest.fn() },
    activationToken: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const baseDto = {
    employeeId: 'EMP100',
    name: 'Bob Employee',
    email: 'Bob@Example.com',
    role: 'EMPLOYEE' as const,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    // Run the transaction callback against the same mock client.
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('role ceiling', () => {
    it('lets a SUPER_ADMIN create another SUPER_ADMIN', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u1',
        ...baseDto,
        email: 'bob@example.com',
        role: 'SUPER_ADMIN',
        status: 'PENDING',
        departmentId: null,
        officeId: null,
      });

      const result = await service.provision(
        { ...baseDto, role: 'SUPER_ADMIN' },
        'SUPER_ADMIN',
        orgId,
      );

      expect(result.role).toBe('SUPER_ADMIN');
      expect(result.activationToken).toEqual(expect.any(String));
    });

    it('forbids an HR_ADMIN from creating a SUPER_ADMIN', async () => {
      await expect(
        service.provision(
          { ...baseDto, role: 'SUPER_ADMIN' },
          'HR_ADMIN',
          orgId,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('forbids an HR_ADMIN from creating another HR_ADMIN', async () => {
      await expect(
        service.provision({ ...baseDto, role: 'HR_ADMIN' }, 'HR_ADMIN', orgId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an HR_ADMIN create an EMPLOYEE', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u2',
        ...baseDto,
        email: 'bob@example.com',
        status: 'PENDING',
        departmentId: null,
        officeId: null,
      });

      const result = await service.provision(baseDto, 'HR_ADMIN', orgId);

      expect(result.status).toBe('PENDING');
    });

    it('forbids an EMPLOYEE from creating anyone', async () => {
      await expect(
        service.provision(baseDto, 'EMPLOYEE', orgId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('provision', () => {
    it('creates the user as PENDING with no password', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u3',
        ...baseDto,
        email: 'bob@example.com',
        status: 'PENDING',
        departmentId: null,
        officeId: null,
      });

      await service.provision(baseDto, 'SUPER_ADMIN', orgId);

      const createArg = mockPrisma.user.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArg.data.status).toBe('PENDING');
      expect(createArg.data.passwordHash).toBeUndefined();
      expect(createArg.data.email).toBe('bob@example.com'); // normalized
      expect(createArg.data.organizationId).toBe(orgId);
    });

    it('stores only a hash of the activation token, never the raw value', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u4',
        ...baseDto,
        email: 'bob@example.com',
        status: 'PENDING',
        departmentId: null,
        officeId: null,
      });

      const result = await service.provision(baseDto, 'SUPER_ADMIN', orgId);

      const tokenArg = mockPrisma.activationToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(tokenArg.data.tokenHash).not.toBe(result.activationToken);
      expect(tokenArg.data.tokenHash).toHaveLength(64); // sha256 hex
    });

    it('rejects a duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.provision(baseDto, 'SUPER_ADMIN', orgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a department belonging to another organization', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.provision(
          { ...baseDto, departmentId: 'dept-from-other-org' },
          'SUPER_ADMIN',
          orgId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-from-other-org', organizationId: orgId },
      });
    });
  });

  describe('findAll', () => {
    it('only returns users in the caller organization', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.findAll(orgId);

      const arg = mockPrisma.user.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where).toEqual({ organizationId: orgId });
    });
  });
});
