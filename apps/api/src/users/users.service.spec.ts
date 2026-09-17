import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import type { ListUsersDto } from './dto/list-users.dto';

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
      count: jest.fn(),
    },
    department: { findFirst: jest.fn() },
    office: { findFirst: jest.fn() },
    activationToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    passwordResetToken: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockMail = {
    sendActivationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
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

  /** A caller with the given role, for the provisioning tests. */
  const callerWithRole = (role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE') => ({
    id: 'caller-1',
    name: 'Ada Owner',
    role,
    organizationId: orgId,
    departmentId: null,
  });

  /** The audit entry written during the action under test. */
  const auditedEntry = () =>
    (
      mockAudit.record.mock.calls[0][0] as {
        action: string;
        actor: { id: string; name: string };
        targetId?: string;
        targetLabel?: string;
        ipAddress?: string;
      }
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      name: 'Acme Corp',
    });
    // Run the transaction callback against the same mock client.
    // Prisma's $transaction takes either a callback (interactive) or an array
    // of queries (batched). The service uses both — writes go through the
    // callback form, findAll batches its page and its count — so the mock has
    // to answer to each.
    mockPrisma.$transaction.mockImplementation(
      (arg: unknown[] | ((tx: typeof mockPrisma) => unknown)) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: AuditService, useValue: mockAudit },
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

      const result = await service.provision({ ...baseDto, role: 'SUPER_ADMIN' }, callerWithRole('SUPER_ADMIN'));

      expect(result.role).toBe('SUPER_ADMIN');
      // The token is emailed, never returned — returning it would let anyone
      // who can read the response activate the account.
      expect(result).not.toHaveProperty('activationToken');
      expect(emailedToken()).toEqual(expect.any(String));
    });

    it('forbids an HR_ADMIN from creating a SUPER_ADMIN', async () => {
      await expect(
        service.provision({ ...baseDto, role: 'SUPER_ADMIN' }, callerWithRole('HR_ADMIN')),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('forbids an HR_ADMIN from creating another HR_ADMIN', async () => {
      await expect(
        service.provision({ ...baseDto, role: 'HR_ADMIN' }, callerWithRole('HR_ADMIN')),
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

      const result = await service.provision(baseDto, callerWithRole('HR_ADMIN'));

      expect(result.status).toBe('PENDING');
    });

    it('forbids an EMPLOYEE from creating anyone', async () => {
      await expect(
        service.provision(baseDto, callerWithRole('EMPLOYEE')),
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

      await service.provision(baseDto, callerWithRole('SUPER_ADMIN'));

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

      await service.provision(baseDto, callerWithRole('SUPER_ADMIN'));

      const tokenArg = mockPrisma.activationToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      expect(tokenArg.data.tokenHash).not.toBe(emailedToken());
      expect(tokenArg.data.tokenHash).toHaveLength(64); // sha256 hex
    });

    it('rejects a duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.provision(baseDto, callerWithRole('SUPER_ADMIN')),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a department belonging to another organization', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.provision(
          { ...baseDto, departmentId: 'dept-from-other-org' },
          callerWithRole('SUPER_ADMIN'),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-from-other-org', organizationId: orgId },
      });
    });
  });

  describe('resendInvitation', () => {
    const admin = {
      id: 'admin-1',
      name: 'Ada Owner',
      role: 'SUPER_ADMIN' as const,
      organizationId: orgId,
      departmentId: null,
    };

    const invitee = {
      id: 'user-9',
      name: 'Bob Employee',
      email: 'bob@example.com',
      role: 'EMPLOYEE' as const,
      status: 'PENDING' as const,
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(invitee);
      // No previous invitation, so no cooldown in the way.
      mockPrisma.activationToken.findFirst.mockResolvedValue(null);
    });

    it('issues a new invitation to a PENDING user', async () => {
      const result = await service.resendInvitation(invitee.id, admin);

      expect(mockPrisma.activationToken.create).toHaveBeenCalled();
      expect(mockMail.sendActivationEmail).toHaveBeenCalled();
      expect(result.message).toContain(invitee.email);
    });

    it('retires the previous invitation before issuing the new one', async () => {
      // Otherwise a link from an earlier email stays redeemable, and every
      // resend widens the window rather than replacing it.
      await service.resendInvitation(invitee.id, admin);

      expect(mockPrisma.activationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: invitee.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('emails a token that is never stored in the clear', async () => {
      await service.resendInvitation(invitee.id, admin);

      const emailed = mockMail.sendActivationEmail.mock.calls[0][1] as string;
      const stored = (
        mockPrisma.activationToken.create.mock.calls[0][0] as {
          data: { tokenHash: string };
        }
      ).data.tokenHash;

      expect(stored).not.toBe(emailed);
      expect(stored).toHaveLength(64);
    });

    it.each(['ACTIVE', 'SUSPENDED'] as const)(
      'refuses to send an activation link to a %s user',
      async (status) => {
        // They already set a password. An activation link would be a working
        // way into the account for anyone reading that inbox — that is what
        // password reset is for, and it expires in 30 minutes rather than 7
        // days.
        mockPrisma.user.findFirst.mockResolvedValue({ ...invitee, status });

        await expect(
          service.resendInvitation(invitee.id, admin),
        ).rejects.toThrow(BadRequestException);
        expect(mockMail.sendActivationEmail).not.toHaveBeenCalled();
      },
    );

    it('refuses a second send inside the cooldown', async () => {
      // Keyed on the recipient, not the caller's IP — the thing worth
      // preventing is one inbox being flooded. Also absorbs a double-clicked
      // button.
      mockPrisma.activationToken.findFirst.mockResolvedValue({
        id: 'at-1',
        createdAt: new Date(Date.now() - 5_000),
      });

      await expect(
        service.resendInvitation(invitee.id, admin),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.activationToken.create).not.toHaveBeenCalled();
      expect(mockMail.sendActivationEmail).not.toHaveBeenCalled();
    });

    it('allows a send once the cooldown has passed', async () => {
      mockPrisma.activationToken.findFirst.mockResolvedValue({
        id: 'at-1',
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      await expect(
        service.resendInvitation(invitee.id, admin),
      ).resolves.toMatchObject({ message: expect.any(String) });
    });

    it('applies the role ceiling', async () => {
      // An HR_ADMIN may not provision a SUPER_ADMIN, so they must not be able
      // to re-invite one either — a fresh activation link is a way into that
      // account.
      const hr = { ...admin, id: 'hr-1', role: 'HR_ADMIN' as const };
      mockPrisma.user.findFirst.mockResolvedValue({
        ...invitee,
        role: 'SUPER_ADMIN',
      });

      await expect(service.resendInvitation(invitee.id, hr)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockMail.sendActivationEmail).not.toHaveBeenCalled();
    });

    it('treats a user in another organization as not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resendInvitation(invitee.id, admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus / delete', () => {
    const admin = {
      id: 'admin-1',
      name: 'Ada Owner',
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
    ) => ({
      id: 'caller-1',
      name: 'Caller One',
      role,
      organizationId: orgId,
      departmentId,
    });

    /** The `where` the service actually sent to Prisma. */
    const whereSentToPrisma = () =>
      (mockPrisma.user.findMany.mock.calls[0][0] as { where: unknown }).where;

    /** The findMany args, for assertions about paging and ordering. */
    const findManyArgs = () =>
      mockPrisma.user.findMany.mock.calls[0][0] as {
        orderBy: unknown;
        skip: number;
        take: number;
      };

    /** Default paging, as the ValidationPipe would supply it. */
    const paging = (over: Partial<ListUsersDto> = {}) =>
      ({ page: 1, limit: 25, ...over }) as ListUsersDto;

    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
    });

    /** Applied to every role — deleted users are kept, not listed. */
    const notDeleted = { status: { not: 'DELETED' } };

    it.each(['SUPER_ADMIN', 'HR_ADMIN'] as const)(
      'gives a %s their whole organization',
      async (role) => {
        await service.findAll(caller(role), paging());

        expect(whereSentToPrisma()).toEqual({
          organizationId: orgId,
          ...notDeleted,
        });
      },
    );

    it('narrows a TEAM_LEAD to their own department', async () => {
      await service.findAll(caller('TEAM_LEAD', 'dept-eng'), paging());

      expect(whereSentToPrisma()).toEqual({
        organizationId: orgId,
        ...notDeleted,
        departmentId: 'dept-eng',
      });
    });

    it.each(['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD'] as const)(
      'hides deleted users from a %s',
      async (role) => {
        await service.findAll(caller(role, 'dept-eng'), paging());

        expect(whereSentToPrisma()).toMatchObject(notDeleted);
      },
    );

    it('never lets a TEAM_LEAD see the organization-wide list', async () => {
      // The regression that matters: if the department filter is ever dropped,
      // this is what catches it. Asserting on the shape above would still pass
      // if someone "fixed" a bug by widening the scope back out.
      await service.findAll(caller('TEAM_LEAD', 'dept-eng'), paging());

      expect(whereSentToPrisma()).not.toEqual({ organizationId: orgId });
    });

    it('returns nothing for a TEAM_LEAD with no department', async () => {
      // `departmentId` is nullable, so this is a reachable state, not a
      // hypothetical. Passing the null straight into the filter would query
      // `WHERE departmentId IS NULL` and hand back every unassigned user in
      // the organization — a wider leak than the one the scope closes.
      const result = await service.findAll(caller('TEAM_LEAD', null), paging());

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('does not scope a SUPER_ADMIN by department even when they have one', async () => {
      // An admin who happens to sit in a department is still an admin.
      await service.findAll(caller('SUPER_ADMIN', 'dept-eng'), paging());

      expect(whereSentToPrisma()).toEqual({
        organizationId: orgId,
        ...notDeleted,
      });
    });
  });

  describe('audit trail', () => {
    const admin = {
      id: 'admin-1',
      name: 'Ada Owner',
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
      mockPrisma.user.update.mockResolvedValue({ ...target, status: 'SUSPENDED' });
    });

    it('records who suspended whom, from where', async () => {
      await service.toggleStatus(target.id, admin, '102.89.44.10');

      expect(auditedEntry()).toMatchObject({
        action: 'USER_SUSPENDED',
        actor: { id: admin.id, name: admin.name },
        targetId: target.id,
        ipAddress: '102.89.44.10',
      });
    });

    it('distinguishes a restore from a suspend', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        status: 'SUSPENDED',
      });
      mockPrisma.user.update.mockResolvedValue({ ...target, status: 'ACTIVE' });

      await service.toggleStatus(target.id, admin);

      expect(auditedEntry().action).toBe('USER_RESTORED');
    });

    it('records a deletion — the entry a leaver dispute turns on', async () => {
      await service.delete(target.id, admin, '102.89.44.10');

      expect(auditedEntry()).toMatchObject({
        action: 'USER_DELETED',
        targetId: target.id,
      });
    });

    it('records a resent invitation', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        status: 'PENDING',
      });
      mockPrisma.activationToken.findFirst.mockResolvedValue(null);

      await service.resendInvitation(target.id, admin);

      expect(auditedEntry().action).toBe('INVITATION_RESENT');
    });

    it('stores the target as a label, not just an id', async () => {
      // An id alone makes an entry unreadable once the person is gone, which
      // is exactly when the trail is consulted. The label is how the record
      // read at the time.
      await service.delete(target.id, admin);

      expect(auditedEntry().targetLabel).toContain(target.name);
      expect(auditedEntry().targetLabel).toContain(target.employeeId);
    });

    it('writes inside the same transaction as the action', async () => {
      // The load-bearing property. If the audit write could fail on its own,
      // an action could happen with nothing recorded — and a trail with silent
      // gaps invites the assumption that anything missing never happened.
      await service.delete(target.id, admin);

      const txArg = mockAudit.record.mock.calls[0][1];
      expect(txArg).toBeDefined();
      expect(txArg).toBe(mockPrisma);
    });

    it('records nothing when the action is refused', async () => {
      const hr = { ...admin, id: 'hr-1', role: 'HR_ADMIN' as const };
      mockPrisma.user.findFirst.mockResolvedValue({
        ...target,
        role: 'SUPER_ADMIN',
      });

      await expect(service.delete(target.id, hr)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('findAll paging', () => {
    const admin = {
      id: 'admin-1',
      name: 'Ada Owner',
      role: 'SUPER_ADMIN' as const,
      organizationId: orgId,
      departmentId: null,
    };

    const paging = (over: Partial<ListUsersDto> = {}) =>
      ({ page: 1, limit: 25, ...over }) as ListUsersDto;

    const findManyArgs = () =>
      mockPrisma.user.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
        skip: number;
        take: number;
      };

    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
    });

    it('orders deterministically, with id as a tiebreaker', async () => {
      // Without an ORDER BY, Postgres may return rows in any order it likes —
      // so page 2 could repeat rows from page 1 and skip others. Pagination
      // would be broken by construction. `id` breaks ties because names are
      // not unique and two people called Jane Doe would otherwise shuffle
      // between pages on every request.
      await service.findAll(admin, paging());

      expect(findManyArgs().orderBy).toEqual([
        { name: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('translates page and limit into skip and take', async () => {
      await service.findAll(admin, paging({ page: 3, limit: 20 }));

      expect(findManyArgs().skip).toBe(40);
      expect(findManyArgs().take).toBe(20);
    });

    it('never skips on the first page', async () => {
      await service.findAll(admin, paging({ page: 1, limit: 10 }));

      expect(findManyArgs().skip).toBe(0);
    });

    it('reports totals from a count over the same filter', async () => {
      mockPrisma.user.count.mockResolvedValue(97);

      const result = await service.findAll(admin, paging({ limit: 25 }));

      expect(result.total).toBe(97);
      expect(result.totalPages).toBe(4);
      // Counting a different set than was listed makes the last page flicker.
      expect(
        (mockPrisma.user.count.mock.calls[0][0] as { where: unknown }).where,
      ).toEqual(findManyArgs().where);
    });

    it('reports one page when there are no results, not zero', async () => {
      // A totalPages of 0 makes "Page 1 of 0" in the UI and breaks any
      // control that clamps the current page against it.
      const result = await service.findAll(admin, paging());

      expect(result.totalPages).toBe(1);
    });

    it('searches name, email and employee ID together', async () => {
      // Pagination without search would leave an admin clicking through two
      // hundred pages to find one person — worse than the slow response it
      // replaced. Which field they happen to have to hand should not matter.
      await service.findAll(admin, paging({ q: 'jane' }));

      expect(findManyArgs().where.OR).toEqual([
        { name: { contains: 'jane', mode: 'insensitive' } },
        { email: { contains: 'jane', mode: 'insensitive' } },
        { employeeId: { contains: 'jane', mode: 'insensitive' } },
      ]);
    });

    it('keeps the tenant scope while searching', async () => {
      // The search must narrow the caller's own rows, never widen past them.
      await service.findAll(admin, paging({ q: 'jane' }));

      expect(findManyArgs().where).toMatchObject({
        organizationId: orgId,
        status: { not: 'DELETED' },
      });
    });

    it('ignores a blank search rather than filtering on empty', async () => {
      await service.findAll(admin, paging({ q: '   ' }));

      expect(findManyArgs().where).not.toHaveProperty('OR');
    });
  });
});
