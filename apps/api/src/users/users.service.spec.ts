import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('UsersService', () => {
  let service: UsersService;
  const orgId = 'org-1';

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    department: { findFirst: jest.fn() },
    office: { findFirst: jest.fn() },
    activationToken: { create: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockMail = {
    sendActivationEmail: jest.fn().mockResolvedValue(undefined),
  };

  /** The raw activation token, which now only ever leaves via the email. */
  const emailedToken = (): string =>
    mockMail.sendActivationEmail.mock.calls[0][1] as string;

  const baseDto = {
    employeeId: 'EMP100',
    name: 'Bob Employee',
    email: 'Bob@Example.com',
    role: 'EMPLOYEE' as const,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      name: 'Acme Corp',
    });
    // Run the transaction callback against the same mock client.
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
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
      // The token is emailed, never returned — returning it would let anyone
      // who can read the response activate the account.
      expect(result).not.toHaveProperty('activationToken');
      expect(emailedToken()).toEqual(expect.any(String));
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

      await service.provision(baseDto, 'SUPER_ADMIN', orgId);

      const tokenArg = mockPrisma.activationToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(tokenArg.data.tokenHash).not.toBe(emailedToken());
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

  describe('toggleStatus / delete', () => {
    const admin = {
      id: 'admin-1',
      role: 'SUPER_ADMIN' as const,
      organizationId: orgId,
    };

    const target = {
      id: 'user-2',
      employeeId: 'EMP200',
      name: 'Bob Employee',
      email: 'bob@example.com',
      role: 'EMPLOYEE' as const,
      status: 'ACTIVE' as const,
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(target);
      mockPrisma.user.update.mockImplementation(
        (args: { data: { status: string } }) => ({
          ...target,
          status: args.data.status,
        }),
      );
    });

    it('suspends an active user and revokes their refresh tokens', async () => {
      const result = await service.toggleStatus(target.id, admin);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: target.id },
        data: { status: 'SUSPENDED' },
      });
      // Access tokens die via JwtStrategy, but refresh tokens are a separate
      // store and would otherwise outlive the suspension.
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: target.id, revoked: false },
        data: { revoked: true },
      });
      expect(result.status).toBe('SUSPENDED');
    });

    it('restores a suspended user without touching refresh tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        status: 'SUSPENDED',
      });

      const result = await service.toggleStatus(target.id, admin);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });

    it('refuses to toggle a PENDING user', async () => {
      // ACTIVE with a null passwordHash is a state login rejects, so the users
      // list would show an account nobody can sign in to.
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        status: 'PENDING',
      });

      await expect(service.toggleStatus(target.id, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the caller organization', async () => {
      await service.toggleStatus(target.id, admin);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: target.id, organizationId: orgId },
      });
    });

    it('treats a user in another organization as not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.toggleStatus(target.id, admin)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.delete(target.id, admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to let a caller act on their own account', async () => {
      await expect(service.toggleStatus(admin.id, admin)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(admin.id, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('forbids an HR_ADMIN from suspending or deleting a SUPER_ADMIN', async () => {
      // Otherwise the role ceiling on provisioning is pointless: an HR_ADMIN
      // could suspend every SUPER_ADMIN and own the organization.
      const hr = { ...admin, id: 'hr-1', role: 'HR_ADMIN' as const };
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        role: 'SUPER_ADMIN',
      });

      await expect(service.toggleStatus(target.id, hr)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.delete(target.id, hr)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes a user the caller has authority over', async () => {
      const result = await service.delete(target.id, admin);

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: target.id },
      });
      expect(result.message).toContain(target.name);
    });
  });
});
