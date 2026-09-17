import { IsString, IsOptional } from 'class-validator';

export class QueryAttendanceHistoryDto {
  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
