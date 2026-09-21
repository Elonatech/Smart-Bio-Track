import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AUDIT_ACTIONS, type AuditAction } from '../audit.service';

export const DEFAULT_PAGE_SIZE = 25;

/** Same ceiling as the user list, for the same reason — see list-users.dto.ts. */
export const MAX_PAGE_SIZE = 100;

export class ListAuditLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a whole number' })
  @Min(1, { message: 'page starts at 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a whole number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_PAGE_SIZE, { message: `limit cannot exceed ${MAX_PAGE_SIZE}` })
  limit: number = DEFAULT_PAGE_SIZE;

  /**
   * Narrow to one kind of action.
   *
   * Validated against the known list rather than accepted as free text: an
   * unrecognised action returns nothing, which reads to an auditor exactly like
   * "this never happened". A 400 says "you asked for something that does not
   * exist" instead.
   */
  @IsOptional()
  @IsIn(AUDIT_ACTIONS as unknown as string[], {
    message: `action must be one of: ${AUDIT_ACTIONS.join(', ')}`,
  })
  action?: AuditAction;

  /** Free-text over the actor and target, for "what happened to Jane?". */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;
}
