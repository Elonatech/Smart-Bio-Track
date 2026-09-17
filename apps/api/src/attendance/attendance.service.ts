import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PunchType, AttendanceStatus, WorkRule } from '@prisma/client';
import { QueryAttendanceHistoryDto } from './dto/query-attendance-history.dto';

type AttendanceState =
  | 'CLOCKED-IN'
  | 'CLOCKED-OUT'
  | 'ON-BREAK'
  | 'NOT-CLOCKED-IN';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(userId: string) {
    const state = await this.getCurrentAttendanceState(userId);

    if (state === 'CLOCKED-IN' || state === 'ON-BREAK') {
      throw new ConflictException(
        'You are already clocked in or on a break. Please clock out before clocking in again.',
      );
    }
    if (state === 'CLOCKED-OUT') {
      throw new ConflictException(
        'You have already clocked out for today. Please wait until tomorrow to clock in again.',
      );
    }

    const punch = await this.prisma.punchEvent.create({
      data: {
        userId,
        type: PunchType.CLOCK_IN,
      },
    });

    await this.recalculateSummary(userId, punch.timestamp);

    return punch;
  }

  async clockOut(userId: string) {
    const state = await this.getCurrentAttendanceState(userId);

    if (state === 'NOT-CLOCKED-IN') {
      throw new BadRequestException(
        'You are not clocked in. Please clock in before clocking out.',
      );
    }
    if (state === 'CLOCKED-OUT') {
      throw new ConflictException(
        'You have already clocked out for today. Please wait until tomorrow to clock in again.',
      );
    }
    if (state === 'ON-BREAK') {
      throw new BadRequestException(
        'You are on a break. Please end your break before clocking out.',
      );
    }

    const punch = await this.prisma.punchEvent.create({
      data: {
        userId,
        type: PunchType.CLOCK_OUT,
      },
    });

    await this.recalculateSummary(userId, punch.timestamp);

    return punch;
  }

  async startBreak(userId: string) {
    const state = await this.getCurrentAttendanceState(userId);

    if (state !== 'CLOCKED-IN') {
      throw new BadRequestException(
        'You are not clocked in. Please clock in before starting a break.',
      );
    }

    return this.prisma.punchEvent.create({
      data: {
        userId,
        type: PunchType.BREAK_START,
      },
    });
  }

  async endBreak(userId: string) {
    const state = await this.getCurrentAttendanceState(userId);

    if (state !== 'ON-BREAK') {
      throw new BadRequestException(
        'You are not on a break. Please start a break before ending it.',
      );
    }

    const punch = await this.prisma.punchEvent.create({
      data: {
        userId,
        type: PunchType.BREAK_END,
      },
    });

    await this.recalculateSummary(userId, punch.timestamp);

    return punch;
  }

  async getTodayAttendance(userId: string) {
    const { startOfDay, endOfDay } = this.getDayBounds(new Date());

    const [punchEvents, summary] = await Promise.all([
      this.prisma.punchEvent.findMany({
        where: {
          userId,
          timestamp: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.attendanceSummary.findUnique({
        where: {
          userId_date: {
            userId,
            date: startOfDay,
          },
        },
      }),
    ]);
    return {
      state: this.deriveStateFromPunchEvents(punchEvents),
      punchEvents,
      summary,
    };
  }

  async getAttendanceHistory(userId: string, query: QueryAttendanceHistoryDto) {
    const where: {
      userId: string;
      date?: {
        gte?: Date;
        lte?: Date;
      };
    } = { userId };

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }
    return this.prisma.attendanceSummary.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  private async getCurrentAttendanceState(
    userId: string,
  ): Promise<AttendanceState> {
    const { startOfDay, endOfDay } = this.getDayBounds(new Date());

    const punchEvents = await this.prisma.punchEvent.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
    return this.deriveStateFromPunchEvents(punchEvents);
  }

  private deriveStateFromPunchEvents(
    punchEvents: { type: PunchType }[],
  ): AttendanceState {
    if (punchEvents.length === 0) {
      return 'NOT-CLOCKED-IN';
    }

    const lastPunch = punchEvents[punchEvents.length - 1].type;

    switch (lastPunch) {
      case PunchType.CLOCK_IN:
      case PunchType.BREAK_END:
        return 'CLOCKED-IN';
      case PunchType.BREAK_START:
        return 'ON-BREAK';
      case PunchType.CLOCK_OUT:
        return 'CLOCKED-OUT';
      default:
        return 'NOT-CLOCKED-IN';
    }
  }

  private getDayBounds(reference: Date) {
    const startOfDay = new Date(reference);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return { startOfDay, endOfDay };
  }

  private async resolveWorkRule(userId: string): Promise<WorkRule | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, officeId: true },
    });

    if (!user) return null;

    const { departmentId, officeId } = user;

    // Priority 1: exact match on both office and department.
    if (officeId && departmentId) {
      const exactMatch = await this.prisma.workRule.findUnique({
        where: { officeId_departmentId: { officeId, departmentId } },
      });
      if (exactMatch) return exactMatch;
    }

    // Priority 2: office-wide default (departmentId is null on the rule).
    if (officeId) {
      const officeWide = await this.prisma.workRule.findFirst({
        where: { officeId, departmentId: null },
      });
      if (officeWide) return officeWide;
    }

    // Priority 3: department-wide default (officeId is null on the rule),
    // for departments that apply the same hours regardless of office.
    if (departmentId) {
      const departmentWide = await this.prisma.workRule.findFirst({
        where: { departmentId, officeId: null },
      });
      if (departmentWide) return departmentWide;
    }

    return null; // No applicable work rule found.
  }

  private parseTimeOnDate(reference: Date, hhmm: string): Date {
    const [hours, minutes] = hhmm.split(':').map(Number);
    const result = new Date(reference);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  private evaluateLateness(
    clockInTime: Date,
    rule: WorkRule | null,
  ): {
    late: boolean;
    message: string;
    minutesLate: number;
    ruleApplied: boolean;
  } {
    if (!rule) {
      // No WorkRule configured for this employee's office/department yet.
      // Don't fabricate a result — mark as not-late but flag that no
      // rule was applied, so this is visible rather than silently wrong.
      return {
        late: false,
        message: 'No work rule found for user',
        minutesLate: 0,
        ruleApplied: false,
      };
    } // No rule means no lateness.

    const officialStart = this.parseTimeOnDate(clockInTime, rule.startTime);

    const graceDeadline = new Date(
      officialStart.getTime() + rule.gracePeriodMinutes * 60 * 1000,
    );

    if (clockInTime <= graceDeadline) {
      return {
        late: false,
        message: 'On time',
        minutesLate: 0,
        ruleApplied: true,
      };
    }

    const minutesLate = Math.round(
      (clockInTime.getTime() - graceDeadline.getTime()) / (60 * 1000),
    );
    return { late: true, message: 'Late', minutesLate, ruleApplied: true };
  }

  private async upsertSummaryOnClockIn(userId: string, clockInTime: Date) {
    const { startOfDay } = this.getDayBounds(clockInTime);
    const workRule = await this.resolveWorkRule(userId);
    const { late, minutesLate } = this.evaluateLateness(clockInTime, workRule);

    await this.prisma.attendanceSummary.upsert({
      where: { userId_date: { userId, date: startOfDay } },
      create: {
        userId,
        date: startOfDay,
        firstClockIn: clockInTime,
        status: late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate: late,
        minutesLate,
      },
      update: {
        // Don't overwrite firstClockIn if it's already set (e.g. re-derivation).
      },
    });
  }
  private async recalculateSummary(userId: string, referenceTime: Date) {
    const { startOfDay, endOfDay } = this.getDayBounds(referenceTime);

    const punchEvents = await this.prisma.punchEvent.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const { totalWorkingMinutes, totalBreakMinutes, lastClockOut } =
      this.computeDurations(punchEvents);
    await this.prisma.attendanceSummary.update({
      where: { userId_date: { userId, date: startOfDay } },
      data: {
        totalWorkingMinutes,
        totalBreakMinutes,
        lastClockOut,
      },
    });
  }

  private computeDurations(
    punchEvents: { type: PunchType; timestamp: Date }[],
  ) {
    let workStart: Date | null = null;
    let breakStart: Date | null = null;
    let totalWorkingMs = 0;
    let totalBreakMs = 0;
    let lastClockOut: Date | null = null;
    for (const punch of punchEvents) {
      switch (punch.type) {
        case PunchType.CLOCK_IN:
          workStart = punch.timestamp;
          break;
        case PunchType.BREAK_START:
          if (workStart) {
            totalBreakMs += punch.timestamp.getTime() - workStart.getTime();
            workStart = null; // Reset workStart during break
          }
          breakStart = punch.timestamp;
          break;
        case PunchType.BREAK_END:
          if (breakStart) {
            totalBreakMs += punch.timestamp.getTime() - breakStart.getTime();
            breakStart = null; // Reset breakStart after break ends
          }
          workStart = punch.timestamp; // Resume work after break
          break;
        case PunchType.CLOCK_OUT:
          if (workStart) {
            totalWorkingMs += punch.timestamp.getTime() - workStart.getTime();
            workStart = null; // Reset workStart after clock out
          }
          lastClockOut = punch.timestamp;
          break;
      }
    }

    return {
      totalWorkingMinutes: Math.round(totalWorkingMs / (1000 * 60)),
      totalBreakMinutes: Math.round(totalBreakMs / (1000 * 60)),
      lastClockOut,
    };
  }
}
