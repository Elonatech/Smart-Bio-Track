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
    activationToken: { create: jest.fn(), updateMany: jest.fn() },
    passwordResetToken: { updateMany: jest.fn() },
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

  describe('toggleStatus / delete', () => {
    const admin = {
      id: 'admin-1',
      role: 'SUPER_ADMIN' as const,
      organizationId: orgId,
      departmentId: null,
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

    it('scopes the lookup to the caller organization, excluding deleted users', async () => {
      await service.toggleStatus(target.id, admin);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: target.id,
          organizationId: orgId,
          status: { not: 'DELETED' },
        },
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

      expect(result.message).toContain(target.name);
    });

    it('marks the user deleted instead of removing the row', async () => {
      // Phase 3 hangs attendance records off userId. A real row delete takes
      // them with it, and those records are what settle a pay dispute with
      // someone who has already left — exactly when you need them.
      await service.delete(target.id, admin);

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();

      const update = mockPrisma.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: { status: string; deletedAt: Date };
      };
      expect(update.where).toEqual({ id: target.id });
      expect(update.data.status).toBe('DELETED');
      expect(update.data.deletedAt).toBeInstanceOf(Date);
    });

    it('revokes sessions and burns unused invite and reset links on delete', async () => {
      // Status alone stops new requests, but a refresh token keeps minting
      // sessions, and an unredeemed invitation is a live way back into an
      // account that is supposed to be gone.
      await service.delete(target.id, admin);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: target.id, revoked: false },
        data: { revoked: true },
      });
      expect(mockPrisma.activationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: target.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: target.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  describe('findAll visibility', () => {
    const caller = (
      role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'TEAM_LEAD',
      departmentId: string | null = null,
    ) => ({ id: 'caller-1', role, organizationId: orgId, departmentId });

    /** The `where` the service actually sent to Prisma. */
    const whereSentToPrisma = () =>
      (mockPrisma.user.findMany.mock.calls[0][0] as { where: unknown }).where;

    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([]);
    });

    /** Applied to every role — deleted users are kept, not listed. */
    const notDeleted = { status: { not: 'DELETED' } };

    it.each(['SUPER_ADMIN', 'HR_ADMIN'] as const)(
      'gives a %s their whole organization',
      async (role) => {
        await service.findAll(caller(role));

        expect(whereSentToPrisma()).toEqual({
          organizationId: orgId,
          ...notDeleted,
        });
      },
    );

    it('narrows a TEAM_LEAD to their own department', async () => {
      await service.findAll(caller('TEAM_LEAD', 'dept-eng'));

      expect(whereSentToPrisma()).toEqual({
        organizationId: orgId,
        ...notDeleted,
        departmentId: 'dept-eng',
      });
    });

    it.each(['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD'] as const)(
      'hides deleted users from a %s',
      async (role) => {
        await service.findAll(caller(role, 'dept-eng'));

        expect(whereSentToPrisma()).toMatchObject(notDeleted);
      },
    );

    it('never lets a TEAM_LEAD see the organization-wide list', async () => {
      // The regression that matters: if the department filter is ever dropped,
      // this is what catches it. Asserting on the shape above would still pass
      // if someone "fixed" a bug by widening the scope back out.
      await service.findAll(caller('TEAM_LEAD', 'dept-eng'));

      expect(whereSentToPrisma()).not.toEqual({ organizationId: orgId });
    });

    it('returns nothing for a TEAM_LEAD with no department', async () => {
      // `departmentId` is nullable, so this is a reachable state, not a
      // hypothetical. Passing the null straight into the filter would query
      // `WHERE departmentId IS NULL` and hand back every unassigned user in
      // the organization — a wider leak than the one the scope closes.
      const result = await service.findAll(caller('TEAM_LEAD', null));

      expect(result).toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('does not scope a SUPER_ADMIN by department even when they have one', async () => {
      // An admin who happens to sit in a department is still an admin.
      await service.findAll(caller('SUPER_ADMIN', 'dept-eng'));

      expect(whereSentToPrisma()).toEqual({
        organizationId: orgId,
        ...notDeleted,
      });
    });
  });
});
