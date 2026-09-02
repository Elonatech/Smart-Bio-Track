import { randomInt } from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Excludes 0/O and 1/I — this ID gets read aloud and retyped, so visually
 * ambiguous characters are worth the smaller alphabet.
 */
const EMPLOYEE_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMPLOYEE_ID_SUFFIX_LENGTH = 5;

/**
 * Prefix per role, so an ID says what the holder is at a glance.
 *
 * Previously every generated ID was hardcoded "ADM-", which was fine while
 * the only caller was the org's founding Super Admin, but would have
 * labelled every invited employee an admin.
 */
const ROLE_PREFIX: Record<UserRole, string> = {
  SUPER_ADMIN: 'ADM',
  HR_ADMIN: 'HR',
  TEAM_LEAD: 'TL',
  EMPLOYEE: 'EMP',
};

/** e.g. "EMP-7K2X9". 32^5 (~33M) combinations per prefix. */
export function generateEmployeeId(role: UserRole): string {
  let suffix = '';
  for (let i = 0; i < EMPLOYEE_ID_SUFFIX_LENGTH; i++) {
    suffix += EMPLOYEE_ID_ALPHABET[randomInt(EMPLOYEE_ID_ALPHABET.length)];
  }
  return `${ROLE_PREFIX[role]}-${suffix}`;
}

/**
 * Generates an employee ID that isn't already taken.
 *
 * `employeeId` is globally unique — not per organization — so this check
 * has to happen server-side against every user, which is why a client can
 * never safely generate one itself.
 *
 * Retries on the astronomically rare collision rather than failing the
 * whole signup over it. Lives here rather than as a private method on
 * AuthService so UsersService can use it too: both the founding-admin path
 * (verifyOrganization) and the invite path (provision) need identical
 * behaviour, and duplicating it would let them drift apart.
 */
export async function generateUniqueEmployeeId(
  prisma: PrismaService,
  role: UserRole,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateEmployeeId(role);
    const existing = await prisma.user.findUnique({
      where: { employeeId: candidate },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique employee ID');
}
