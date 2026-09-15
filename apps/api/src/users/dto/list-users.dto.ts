import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** What a caller gets when they ask for no particular size. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Hard ceiling on `limit`.
 *
 * Without it the cap is decoration: `?limit=999999` reinstates exactly the
 * unbounded response this endpoint was paginated to avoid, and anyone can ask
 * for it. The ceiling is the fix; the default is only a convenience.
 */
export const MAX_PAGE_SIZE = 100;

export class ListUsersDto {
  /** 1-indexed, to match what the page control shows a human. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a whole number' })
  @Min(1, { message: 'page starts at 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a whole number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_PAGE_SIZE, {
    message: `limit cannot exceed ${MAX_PAGE_SIZE}`,
  })
  limit: number = DEFAULT_PAGE_SIZE;

  /**
   * Free-text search across name, email and employee ID.
   *
   * Not a nice-to-have bolted on beside pagination — the two have to ship
   * together. Paginating a five-thousand-person directory into two hundred
   * pages with no way to search would leave an admin clicking through them to
   * find one person, which is worse than the slow response it replaced.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;
}
