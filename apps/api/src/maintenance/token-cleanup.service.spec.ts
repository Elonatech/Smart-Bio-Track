import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCleanupService } from './token-cleanup.service';

describe('TokenCleanupService', () => {
  let service: TokenCleanupService;

  const table = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  });

  const mockPrisma = {
    refreshToken: table(),
    activationToken: table(),
    passwordResetToken: table(),
    pendingOrganizationSignup: table(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const name of [
      'refreshToken',
      'activationToken',
      'passwordResetToken',
      'pendingOrganizationSignup',
    ] as const) {
      mockPrisma[name].findMany.mockResolvedValue([]);
      mockPrisma[name].deleteMany.mockResolvedValue({ count: 0 });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(TokenCleanupService);
  });

  it('sweeps all four token tables', async () => {
    await service.cleanupExpiredTokens();

    expect(mockPrisma.refreshToken.findMany).toHaveBeenCalled();
    expect(mockPrisma.activationToken.findMany).toHaveBeenCalled();
    expect(mockPrisma.passwordResetToken.findMany).toHaveBeenCalled();
    expect(mockPrisma.pendingOrganizationSignup.findMany).toHaveBeenCalled();
  });

  it('selects on expiry alone, never on revoked', async () => {
    // The load-bearing assertion of this whole service. Refresh-token theft
    // detection needs a SPENT token to still be findable: if revoked rows were
    // swept early, a replay would read as an unknown token — a plain 401 with
    // no family revocation — and the thief's own session would survive.
    // Expiry is safe because `refresh` rejects anything past expiresAt before
    // it ever reaches the reuse check.
    const now = new Date('2026-09-15T00:00:00Z');

    await service.cleanupExpiredTokens(now);

    const where = (
      mockPrisma.refreshToken.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      }
    ).where;

    expect(where).toEqual({ expiresAt: { lt: now } });
    expect(where).not.toHaveProperty('revoked');
    expect(where).not.toHaveProperty('rotatedAt');
  });

  it('deletes in bounded pages rather than one huge statement', async () => {
    // An unbounded DELETE over millions of rows holds a long lock and floods
    // WAL. Paging keeps each statement short enough that ordinary traffic
    // interleaves with it.
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `rt-${i}` }));

    mockPrisma.refreshToken.findMany
      .mockResolvedValueOnce(page(5000))
      .mockResolvedValueOnce(page(5000))
      .mockResolvedValueOnce(page(120));
    mockPrisma.refreshToken.deleteMany
      .mockResolvedValueOnce({ count: 5000 })
      .mockResolvedValueOnce({ count: 5000 })
      .mockResolvedValueOnce({ count: 120 });

    const result = await service.cleanupExpiredTokens();

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledTimes(3);
    expect(result.refreshTokens).toBe(10_120);

    // Deleting by primary key rather than re-running the predicate, so every
    // delete stays on an index.
    const firstDelete = mockPrisma.refreshToken.deleteMany.mock
      .calls[0][0] as { where: { id: { in: string[] } } };
    expect(firstDelete.where.id.in).toHaveLength(5000);
  });

  it('stops after a short page instead of querying again', async () => {
    mockPrisma.refreshToken.findMany.mockResolvedValueOnce([{ id: 'rt-1' }]);
    mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.cleanupExpiredTokens();

    expect(mockPrisma.refreshToken.findMany).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is nothing expired', async () => {
    const result = await service.cleanupExpiredTokens();

    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      refreshTokens: 0,
      activationTokens: 0,
      passwordResetTokens: 0,
      pendingOrganizationSignups: 0,
    });
  });

  describe('timer lifecycle', () => {
    afterEach(() => {
      service.onModuleDestroy();
    });

    it('does not hold the process open', () => {
      // Without unref() a test run hangs for six hours after the last
      // assertion, and a container refuses to shut down promptly.
      const unref = jest.fn();
      const spy = jest
        .spyOn(global, 'setInterval')
        .mockReturnValue({ unref } as unknown as NodeJS.Timeout);

      service.onModuleInit();

      expect(unref).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('clears the timer on shutdown', () => {
      const clear = jest.spyOn(global, 'clearInterval');

      service.onModuleInit();
      service.onModuleDestroy();

      expect(clear).toHaveBeenCalled();
      clear.mockRestore();
    });
  });
});
