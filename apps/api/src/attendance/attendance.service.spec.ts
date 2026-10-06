import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PunchType } from '@prisma/client';

describe('AttendanceService', () => {
  let service: AttendanceService;

  const mockPrismaService = {
    punchEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },

    attendanceSummary: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },

    user: {
      findUnique: jest.fn(),
    },

    workRule: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockUserId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('clockIn', () => {
    it('should create a punch record for clocking in', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([]);
      mockPrismaService.punchEvent.create.mockResolvedValue({
        id: 'punch-1',
        userId: mockUserId,
        type: PunchType.CLOCK_IN,
        timestamp: new Date(),
      });
      mockPrismaService.attendanceSummary.upsert.mockResolvedValue({});

      const result = await service.clockIn(mockUserId);

      expect(result.type).toBe(PunchType.CLOCK_IN);
      expect(mockPrismaService.punchEvent.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          type: PunchType.CLOCK_IN,
          timestamp: new Date(),
        },
      });
    });

    it('should throw ConflictException if user has already clocked in', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([
        { type: PunchType.CLOCK_IN, timestamp: new Date() },
      ]);

      await expect(service.clockIn(mockUserId)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPrismaService.punchEvent.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if user has already clocked out', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([
        { type: PunchType.CLOCK_IN, timestamp: new Date() },
        { type: PunchType.CLOCK_OUT, timestamp: new Date() },
      ]);

      await expect(service.clockIn(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('clockIn - Work Rule resolution and lateness', () => {
    const officeId = 'office-1';
    const departmentId = 'department-1';

    beforeEach(() => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([]);
      mockPrismaService.user.findUnique.mockResolvedValue({
        officeId,
        departmentId,
      });
      mockPrismaService.attendanceSummary.findUnique.mockResolvedValue({});
    });

    it(' uses the office-department-specific work rule if available', async () => {
      mockPrismaService.workRule.findUnique.mockResolvedValue({
        startTime: '08:00',
        gracePeriod: '15',
      });

      const clockInTime = new Date();
      clockInTime.setHours(8, 20, 0, 0); // 08:20 AM

      mockPrismaService.punchEvent.create.mockResolvedValue({
        id: 'punch-1',
        userId: mockUserId,
        type: PunchType.CLOCK_IN,
        timestamp: clockInTime,
      });

      await service.clockIn(mockUserId);

      expect(mockPrismaService.workRule.findUnique).toHaveBeenCalledWith({
        where: {
          officeId_departmentId: {
            officeId,
            departmentId,
          },
        },
      });

      expect(mockPrismaService.workRule.findFirst).toHaveBeenCalledWith();

      const upsertArgs =
        mockPrismaService.attendanceSummary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.isLate).toBe(true);
      expect(upsertArgs.create.minutesLate).toBe(20); // 20 minutes late
    });

    it(' falls back to to the office-wide rules when no exact match exists', async () => {
      mockPrismaService.workRule.findUnique.mockResolvedValue(null);
      mockPrismaService.workRule.findFirst.mockResolvedValue({
        startTime: '09:00',
        gracePeriod: '10',
      });

      const clockInTime = new Date();
      clockInTime.setHours(9, 10, 0, 0); // 09:10 AM
      mockPrismaService.punchEvent.create.mockResolvedValue({
        id: 'punch-1',
        userId: mockUserId,
        type: PunchType.CLOCK_IN,
        timestamp: clockInTime,
      });

      await service.clockIn(mockUserId);

      expect(mockPrismaService.workRule.findUnique).toHaveBeenCalledWith({
        where: { officeId, departmentId: null },
      });

      const upsertArgs =
        mockPrismaService.attendanceSummary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.isLate).toBe(false);
    });

    it(' marks not-late (without fabricating a rule) when no work rule is configured at all', async () => {
      mockPrismaService.workRule.findUnique.mockResolvedValue(null);
      mockPrismaService.workRule.findFirst.mockResolvedValue(null);

      const clockInTime = new Date();
      clockInTime.setHours(10, 0, 0, 0); // 10:00 AM

      mockPrismaService.punchEvent.create.mockResolvedValue({
        id: 'punch-1',
        userId: mockUserId,
        type: PunchType.CLOCK_IN,
        timestamp: clockInTime,
      });

      await service.clockIn(mockUserId);

      const upsertArgs =
        mockPrismaService.attendanceSummary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.isLate).toBe(false);
      expect(upsertArgs.create.minutesLate).toBe(0);
    });
  });

  describe('clockOut', () => {
    it('throws Bad request when user has not clocked in', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([]);
      await expect(service.clockOut(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.punchEvent.create).not.toHaveBeenCalled();
    });

    it(' throws bad request when currently on break', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([
        { type: PunchType.CLOCK_IN, timestamp: new Date() },
        { type: PunchType.BREAK_START, timestamp: new Date() },
      ]);

      await expect(service.clockOut(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it(' Succeeds when curently clocked in and not on break', async () => {
      mockPrismaService.punchEvent.findMany
        .mockResolvedValue([
          { type: PunchType.CLOCK_IN, timestamp: new Date() },
        ])
        .mockResolvedValueOnce({
          type: PunchType.CLOCK_IN,
          timestamp: new Date(),
        });

      mockPrismaService.punchEvent.create.mockResolvedValue({
        id: 'punch-2',
        userId: mockUserId,
        type: PunchType.CLOCK_OUT,
        timestamp: new Date(),
      });

      mockPrismaService.attendanceSummary.update.mockResolvedValue({});

      const result = await service.clockOut(mockUserId);
      expect(result.type).toBe(PunchType.CLOCK_OUT);
    });
  });

  describe('breakStart', () => {
    it('throws BadRequest Exception when user has not clocked in', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([]);

      await expect(service.startBreak(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest Exception when user is already on break', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([
        { type: PunchType.CLOCK_IN, timestamp: new Date() },
        { type: PunchType.BREAK_START, timestamp: new Date() },
      ]);

      await expect(service.startBreak(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('breakEnd', () => {
    it('throws BadRequest Exception when user is not currently on break', async () => {
      mockPrismaService.punchEvent.findMany.mockResolvedValue([
        { type: PunchType.CLOCK_IN, timestamp: new Date() },
      ]);

      await expect(service.endBreak(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
