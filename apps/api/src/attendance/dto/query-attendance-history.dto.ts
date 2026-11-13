import { IsOptional, Matches } from 'class-validator';

/**
 * Local calendar dates in the organisation's timezone, "YYYY-MM-DD".
 *
 * Plain dates rather than timestamps because a day is the unit people ask
 * about — "show me last week" — and a timestamp would make the caller pick a
 * timezone the server then has to second-guess. Both default sensibly: `to`
 * is today, `from` is 29 days before it.
 */
const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class QueryAttendanceHistoryDto {
  @IsOptional()
  @Matches(LOCAL_DATE, { message: 'from must be a date in YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @Matches(LOCAL_DATE, { message: 'to must be a date in YYYY-MM-DD format' })
  to?: string;
}
