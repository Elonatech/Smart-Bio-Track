import {
  Injectable,
  type OnModuleDestroy,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  jwtAccessSecret,
  jwtAccessExpiry,
  jwtRefreshSecret,
  jwtRefreshExpiry,
} from './jwt/jwt.constants';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreatePendingOrganizationDto } from './dto/create-pending-organization.dto';
import { VerifyOrganizationDto } from './dto/verify-organization.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import {
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  PENDING_ORG_SIGNUP_TOKEN_TTL_DAYS,
  REFRESH_ROTATION_GRACE_SECONDS,
  expiryInDays,
  expiryInMinutes,
  generateToken,
  hashToken,
} from '../common/token.util';
import { generateUniqueEmployeeId } from '../common/employee-id.util';
import { hashPassword, needsPasswordRehash } from '../common/password.util';
import { LOCKOUT_THRESHOLD, lockoutExpiry } from './lockout.config';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

/**
 * A real argon2 hash, verified against when no account matches, so that a
 * failed sign-in costs the same whether or not the account exists.
 *
 * Hashed from a random value at first use rather than hardcoded: a checked-in
 * constant would be a hash of a *known* string, and the whole point is that no
 * caller can ever supply the input that matches it.
 *
 * Hashed through `PASSWORD_HASH_OPTIONS`, the same settings every real password
 * uses — which is what keeps the decoy the same cost as the real thing. Equal
 * cost is the entire mechanism: a cheaper decoy reopens the timing oracle in
 * the direction of "unknown accounts answer faster".
 *
 * It used to call `argon2.hash` with no options, which was correct only
 * because the three real sites did the same. #20 moved them all behind one
 * definition, so this now follows them automatically rather than by anyone
 * remembering.
 *
 * Memoised, so the hash is computed once per process and every later refusal
 * pays only the verify.
 */
let decoyHash: Promise<string> | null = null;

function decoyPasswordHash(): Promise<string> {
  decoyHash ??= hashPassword(`${randomUUID()}${randomUUID()}`);
  return decoyHash;
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Writes started during a request but deliberately not awaited by it.
   *
   * Only the failed-sign-in counter uses this: awaiting a database round trip
   * on a refusal would make a real account measurably slower to reject than an
   * unknown one, which is the timing oracle #19 closed.
   *
   * Detaching the write is correct; forgetting about it is not. Two things
   * need to be able to wait for these:
   *
   *  * **Shutdown.** Nest resolves onModuleDestroy before the process exits;
   *    without this, a deploy or a SIGTERM drops whatever was in flight, and
   *    the writes most likely to be in flight are the ones recording an attack
   *    in progress.
   *  * **Tests.** The e2e suite truncates every table between tests. An
   *    in-flight transaction and a TRUNCATE contend for the same lock, which
   *    surfaced as fourteen unrelated tests failing further down the file —
   *    a far more confusing symptom than its cause.
   */
  private readonly pendingWrites = new Set<Promise<unknown>>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private auditService: AuditService,
  ) {
    // Warm the decoy at boot, not on the first refusal.
    //
    // Without this the first unknown-account sign-in of each process pays for
    // a hash *and* a verify while every later one pays only the verify — a
    // one-off outlier that still says "this identifier was never seen before".
    // Rare enough to look like noise, which is precisely why it would survive.
    void decoyPasswordHash();
  }

  /**
   * First half of self-service org signup: takes only email + password.
   * Organization name, admin name, and industry are collected later at
   * verifyOrganization — nothing real is created here, just a pending claim.
   */
  async createPendingOrganization(dto: CreatePendingOrganizationDto) {
    const { email, password } = dto;

    const normalizedEmail = email.toLowerCase().trim();

    // One response for every outcome, decided before any lookup runs.
    //
    // This endpoint is public and unauthenticated. It used to answer
    // "An organization with this email already exists" or "A user with this
    // email already exists" or "A verification email was already sent" — three
    // distinguishable replies that together let anyone test whether any address
    // has an account here. For an attendance product that is a list of who
    // works for our customers, and it is exactly the enumeration oracle that
    // forgotPassword and resendOrganizationVerification were already written to
    // avoid. This path was the hole in that.
    //
    // Whatever the truth is, it now travels by email, where only the person who
    // controls the inbox can read it.
    const genericResponse = {
      message:
        'Check your email to verify and complete your organization registration.',
    };

    const [existingOrgByEmail, existingUserByEmail] = await Promise.all([
      this.prisma.organization.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
    ]);

    if (existingOrgByEmail || existingUserByEmail) {
      try {
        await this.mailService.sendAccountAlreadyExistsEmail(normalizedEmail);
      } catch (error) {
        // Swallowed, like forgotPassword's: letting a send failure surface as a
        // 500 here would turn this back into the oracle the generic response
        // exists to prevent — free address returns 200, taken address whose
        // email failed returns 500.
        this.logger.error(
          `"Account already exists" notice failed to send: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return genericResponse;
    }

    // A pending signup for this address is no longer looked up at all. It used
    // to produce its own distinguishable message; now the upsert below simply
    // reissues, which is both non-distinguishing and the more useful behaviour
    // — the usual reason somebody retries here is that the first email never
    // arrived. Rotating the token hash invalidates the older link, so this
    // cannot leave two live tokens pointing at one address.

    const passwordHash = await hashPassword(password);
    const rawToken = generateToken();

    // Upsert rather than create: an existing pending row for this email — live
    // or expired — is replaced in place instead of colliding on the unique
    // `email` column, and the new token hash retires the older link.
    await this.prisma.pendingOrganizationSignup.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        passwordHash,
        tokenHash: hashToken(rawToken),
        expiresAt: expiryInDays(PENDING_ORG_SIGNUP_TOKEN_TTL_DAYS),
      },
      update: {
        passwordHash,
        tokenHash: hashToken(rawToken),
        expiresAt: expiryInDays(PENDING_ORG_SIGNUP_TOKEN_TTL_DAYS),
      },
    });

    try {
      await this.mailService.sendOrganizationVerificationEmail(
        normalizedEmail,
        rawToken,
      );
    } catch (error) {
      // Swallowed rather than surfaced as a 500, and the row is left in place.
      //
      // Both of those changed with the generic response above. A 500 here would
      // be its own oracle in reverse: a taken address returns 200, so an error
      // would mean "this address was free". And the old rollback existed only
      // to stop a leftover row tripping the "verification already sent" check,
      // which no longer exists — the upsert now simply reissues on retry.
      this.logger.error(
        `Organization verification email failed to send: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return genericResponse;
  }
  /**
   * Issues a fresh verification token for a signup still waiting on its email.
   *
   * Like forgotPassword, this always answers identically — a pending signup is
   * keyed by email address, so a distinguishing response would reveal which
   * addresses are mid-registration.
   */
  async resendOrganizationVerification(dto: ResendVerificationDto) {
    const genericResponse = {
      message:
        'If that email is awaiting verification, a new link has been sent.',
    };

    const normalizedEmail = dto.email.toLowerCase().trim();

    const pending = await this.prisma.pendingOrganizationSignup.findUnique({
      where: { email: normalizedEmail },
    });

    if (!pending) {
      return genericResponse;
    }

    // An expired signup is not revived here — the row is cleared out so the
    // address is free again, and the caller starts over.
    if (pending.expiresAt < new Date()) {
      await this.prisma.pendingOrganizationSignup.delete({
        where: { id: pending.id },
      });
      return genericResponse;
    }

    const rawToken = generateToken();

    // Rotating the hash invalidates the previous link the moment a new one is
    // requested, matching how forgotPassword retires unused reset tokens.
    await this.prisma.pendingOrganizationSignup.update({
      where: { id: pending.id },
      data: {
        tokenHash: hashToken(rawToken),
        expiresAt: expiryInDays(PENDING_ORG_SIGNUP_TOKEN_TTL_DAYS),
      },
    });

    try {
      await this.mailService.sendOrganizationVerificationEmail(
        normalizedEmail,
        rawToken,
      );
    } catch (error) {
      // Swallowed for the same reason as forgotPassword — a 500 here would
      // distinguish a real pending signup from an unknown address.
      this.logger.error(
        `Verification resend failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return genericResponse;
  }

  /**
   * Second half of self-service org signup: redeems the token from
   * createPendingOrganization and takes the fields that weren't collected
   * up front — organization name, the admin's own name, and industry.
   * Creates the real Organization + SUPER_ADMIN User and logs them straight
   * in, same as completeRegistration does for the employee-invite flow.
   */
  async verifyOrganization(dto: VerifyOrganizationDto) {
    const { token, adminName, industry } = dto;
    const organizationName = dto.organizationName.trim();

    const stored = await this.prisma.pendingOrganizationSignup.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    // Same non-distinguishing message for missing, expired, or already-
    // redeemed tokens — see completeRegistration for why.
    if (!stored || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // No check that the organization name is free, because it no longer has to
    // be. Two companies genuinely called "Sterling Ltd" can both register; they
    // are separate tenants addressed by id and never see one another. See the
    // comment on Organization.name in schema.prisma.

    const employeeId = await generateUniqueEmployeeId(this.prisma, 'SUPER_ADMIN');

    let user: User;

    try {
      user = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: organizationName,
            email: stored.email,
            industry,
          },
        });

        const created = await tx.user.create({
          data: {
            employeeId,
            name: adminName,
            email: stored.email,
            passwordHash: stored.passwordHash,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            organizationId: organization.id,
          },
        });

        // The pending row's only job was to survive until this moment.
        await tx.pendingOrganizationSignup.delete({ where: { id: stored.id } });

        return created;
      });
    } catch (e) {
      // The address was free when step one ran, but a signup can sit pending
      // for seven days — long enough for someone else to claim it in between.
      // Postgres catches the race; without this the caller gets an opaque 500
      // for something they could actually act on.
      //
      // Only the email can collide now. The organization name used to be able
      // to as well, which is why this message named both.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'That email address has already been registered. Please start again.',
        );
      }
      throw e;
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  /**
   * Second half of the provisioning flow: an invited user redeems the
   * activation token they were given and sets their own password, which
   * flips them from PENDING to ACTIVE and logs them straight in.
   */
  async completeRegistration(dto: CompleteRegistrationDto) {
    const { token, password, confirmPassword } = dto;

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const stored = await this.prisma.activationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    // One message for every failure mode — a redeemed, expired, or entirely
    // fictional token should be indistinguishable to the caller.
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired activation token');
    }

    if (stored.user.status !== 'PENDING') {
      throw new BadRequestException('This account has already been activated');
    }

    const passwordHash = await hashPassword(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash, status: 'ACTIVE' },
      });

      await tx.activationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });

      return activated;
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  /**
   * PRTS FR-001 — accepts an Employee ID or an email address in `identifier`.
   * The presence of "@" decides which; the client does not get to declare it.
   */
  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();

    const user = identifier.includes('@')
      ? await this.prisma.user.findUnique({
          where: { email: identifier.toLowerCase() },
        })
      : await this.prisma.user.findUnique({
          where: { employeeId: identifier },
        });

    // A PENDING user has no passwordHash yet, so this also covers "invited but
    // never activated" without leaking that the account exists.
    if (!user || !user.passwordHash) {
      // Verify against a decoy before refusing.
      //
      // The reply was already identical for "no such account" and "wrong
      // password" — but the *timing* was not, and timing is readable from
      // anywhere. Returning here skipped argon2 entirely, and argon2 is
      // deliberately slow: a real account answered in ~100ms while an unknown
      // one came back almost at once. That gap is a lookup oracle. An attacker
      // sends a list of addresses with any password at all and sorts by
      // response time, which is exactly the enumeration #13a closed on the
      // registration endpoint — reopened here, on the endpoint that does not
      // even need a valid password to answer.
      //
      // So do the work anyway. The result is discarded; the cost is the point.
      await argon2.verify(await decoyPasswordHash(), dto.password);

      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    const isLocked = user.lockedUntil !== null && user.lockedUntil > now;

    // The lock is checked *after* this verify, never before — see below.
    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      // Count the failure, but do not wait for the write.
      //
      // Awaiting a round trip to Neon here would add ~20ms to a failed sign-in
      // for a *real* account and nothing at all for an unknown one, which is
      // #19's timing oracle rebuilt at a fifth of the volume — quieter, still
      // extractable by averaging. Detaching it keeps both refusals costing
      // exactly one argon2 verify.
      //
      // The trade is that a crash between the response and the write loses one
      // increment. For a counter whose threshold is five, that is the cheaper
      // of the two failures by a wide margin.
      if (!isLocked) {
        this.trackPendingWrite(this.recordFailedAttempt(user));
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Everything below here is reached only with the correct password, which
    // is what makes it safe to say anything specific at all.
    if (isLocked) {
      // Naming the lock leaks nothing a caller with the right password does
      // not already know, and the alternative is an employee who cannot tell
      // "my password is wrong" from "I am locked out" and keeps trying.
      //
      // A correct password during a lockout neither clears the lock nor
      // extends it. Clearing it would make the lock trivially bypassable by
      // the one attacker who has already succeeded; extending it would punish
      // the employee for the attacker's persistence.
      throw new UnauthorizedException(
        'Too many failed attempts. Try again in a few minutes.',
      );
    }

    // Clear the slate, but only when there is something to clear — otherwise
    // every successful sign-in in the product writes to the users table for no
    // reason.
    if (user.failedLoginAttempts > 0 || user.lockedUntil !== null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Quietly upgrade a hash made with older settings.
    //
    // An argon2 hash carries its own parameters, so `verify` keeps working
    // against whatever produced it — which is why changing PASSWORD_HASH_OPTIONS
    // locks nobody out, and equally why every account created before the change
    // would otherwise keep its original cost for life. A successful sign-in is
    // the only moment the plaintext is in hand, so it is the only moment this
    // can happen.
    //
    // After the verify, never before: the refusal path must stay exactly as
    // expensive as it was, or this undoes #19.
    if (needsPasswordRehash(user.passwordHash)) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(dto.password) },
        });
      } catch (error) {
        // Never fail a valid sign-in over an optimisation. The user is who they
        // say they are; the worst case is that they keep the old hash and we
        // try again next time.
        this.logger.error(
          `Password rehash failed for ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Whitelist, not a blacklist, and the difference is the whole point.
    //
    // This used to read `if (status === 'SUSPENDED') throw`, which asks "is
    // this one bad state?" — so the moment DELETED was added to the enum, a
    // deleted employee could still sign in. A rule written the other way round
    // ("is this the one good state?") rejects every status added after it,
    // including ones nobody has thought of yet. Enum values get added; guards
    // rarely get revisited.
    if (user.status !== 'ACTIVE') {
      // Naming the reason leaks nothing: the correct password is already
      // proven by this point, so the caller knows the account exists. Telling
      // them which wall they hit is the difference between a support ticket
      // and a password reset loop.
      throw new UnauthorizedException(
        user.status === 'SUSPENDED'
          ? 'Account is suspended'
          : 'This account is no longer active',
      );
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  private trackPendingWrite(work: Promise<unknown>): void {
    this.pendingWrites.add(work);
    void work.finally(() => this.pendingWrites.delete(work));
  }

  /**
   * Waits for every detached write to finish.
   *
   * `allSettled`, not `all`: these are best-effort writes that already handle
   * their own failures, and a rejection here must not prevent shutdown.
   */
  async flushPendingWrites(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushPendingWrites();
  }

  /**
   * Records one failed sign-in, and locks the account at the threshold.
   *
   * Called detached from the request (see `login`), so it must never throw —
   * an unhandled rejection here would take the process down over a counter.
   *
   * **The counter resets to zero when the lock is set**, rather than climbing.
   * Otherwise a user whose lock had just expired would be re-locked by their
   * very next mistake, since the count would still be sitting at the
   * threshold — a fifteen-minute lock that quietly becomes permanent for
   * anyone who keeps typing the same wrong password.
   */
  private async recordFailedAttempt(
    user: Pick<
      User,
      | 'id'
      | 'name'
      | 'employeeId'
      | 'organizationId'
      | 'failedLoginAttempts'
      | 'lockedUntil'
    >,
  ): Promise<void> {
    try {
      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        // Clear a lock that has already run out, atomically. Doing this as a
        // conditional update rather than reading first is what keeps the whole
        // method free of read-modify-write.
        await tx.user.updateMany({
          where: { id: user.id, lockedUntil: { lte: now } },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });

        // `increment`, not "read the count and write count + 1".
        //
        // This method runs detached from the request, so several failed
        // sign-ins can be in flight at once — and with a read-modify-write
        // every one of them reads the same stale value and writes 1. The
        // counter never climbs, and the account never locks. That is not a
        // theoretical race: an attacker guessing passwords sends requests in
        // parallel, which is precisely the case this feature exists for, so
        // the bug would have hidden from every honest user and been available
        // to every dishonest one. Caught by the e2e suite; invisible to the
        // unit tests, because a mocked Prisma returns whatever it is told.
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });

        if (updated.failedLoginAttempts < LOCKOUT_THRESHOLD) return;

        // Conditional on the account not already being locked, so that two
        // attempts crossing the threshold together produce one lock and one
        // audit entry rather than two of each.
        const locked = await tx.user.updateMany({
          where: { id: user.id, lockedUntil: null },
          data: { failedLoginAttempts: 0, lockedUntil: lockoutExpiry(now) },
        });

        if (locked.count === 1) {
          // Inside the transaction, like every other audit write (#22): if the
          // entry cannot be stored, the lock is not applied either. An
          // unrecorded lockout is the one that gets reported as "the system
          // randomly logged me out".
          await this.auditService.record(
            {
              organizationId: user.organizationId,
              // No actor. This is the system reacting, not a person acting —
              // AuditService renders that as "System" rather than leaving the
              // reader to guess whether a blank name is a bug.
              actor: null,
              action: 'USER_LOCKED_OUT',
              targetType: 'User',
              targetId: user.id,
              targetLabel: `${user.name} (${user.employeeId})`,
            },
            tx,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to record a failed sign-in for ${user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Ends every live token descended from one sign-in.
   *
   * Called when a spent token is replayed. At that moment two parties have held
   * the same token and there is no way to tell which one is asking, so the only
   * safe move is to end the session for both and make them sign in again.
   */
  private async revokeFamily(familyId: string) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { familyId, revoked: false },
      data: { revoked: true },
    });

    return count;
  }

  /**
   * Exchanges a refresh token for a new pair, and treats replay as theft.
   *
   * Rotation alone tells you nothing: it invalidates the old token, but if an
   * attacker copied it and used it first, the *victim* gets the 401 and the
   * attacker walks away with a working session. Nothing anywhere notices. What
   * turns rotation into detection is reacting to the second use — a spent token
   * coming back means it was copied, and the response is to end the session
   * rather than to refuse one request.
   *
   * The grace window (see REFRESH_ROTATION_GRACE_SECONDS) is what stops that
   * being hair-trigger: a browser with two tabs legitimately sends the same
   * cookie twice within milliseconds.
   */
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revoked) {
      // Revoked without being rotated means the session was ended on purpose —
      // a sign-out, a suspension, a password reset. Presenting it again is
      // ordinary (a stale tab), not evidence of anything, so it is refused
      // without touching the rest of the session.
      if (!stored.rotatedAt) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const graceExpiresAt = new Date(
        stored.rotatedAt.getTime() + REFRESH_ROTATION_GRACE_SECONDS * 1000,
      );

      if (new Date() > graceExpiresAt) {
        const revoked = await this.revokeFamily(stored.familyId);

        // Worth a real log line: this is the one signal that distinguishes a
        // stolen session from an expired one. No token or hash goes in it —
        // logs get shipped, and this is enough to find the account.
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId} ` +
            `(session ${stored.familyId}); revoked ${revoked} live token(s).`,
        );

        throw new UnauthorizedException('Invalid refresh token');
      }

      // Inside the window. The caller is almost certainly the owner's second
      // tab, so it falls through and is issued a token of its own in the same
      // family. Two tabs then hold two tokens, which is no different from the
      // same person on two devices.
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Same predicate JwtStrategy applies on every authenticated request. Without
    // it this endpoint hands a suspended user a fresh pair of tokens and a 200,
    // which the very next request then rejects — a confusing way to learn your
    // account is closed. Suspending already revokes refresh tokens, so in
    // practice `stored.revoked` above catches it first; this covers a status
    // changed by any route that does not clean up after itself.
    //
    // Presenting a valid refresh token proves ownership, so naming the reason
    // leaks nothing — the same reasoning as login's 'Account is suspended'.
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Skipped when this token was already rotated — it is a grace-window
    // replay, and re-stamping rotatedAt would slide the window forward on every
    // replay, keeping a stolen token alive indefinitely.
    if (!stored.revoked) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true, rotatedAt: new Date() },
      });
    }

    // Same family: this is a continuation of the session that started at
    // sign-in, not a new one, and theft detection needs the chain intact.
    return this.issueTokens(
      user.id,
      user.email,
      user.role,
      stored.familyId,
    );
  }

  /**
   * Revokes refresh tokens for a user. Access tokens are stateless and cannot
   * be recalled, so one may remain usable until it expires (15 minutes by
   * default) — revoking the refresh token is what stops the session renewing
   * beyond that.
   */
  async logout(userId: string, dto: LogoutDto) {
    if (dto.all) {
      const { count } = await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
      return { message: `Signed out of ${count} session(s)` };
    }

    if (!dto.refreshToken) {
      throw new BadRequestException(
        'A refreshToken is required unless "all" is true',
      );
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
    });

    // Only revoke a token that belongs to the caller — otherwise anyone with a
    // valid access token could revoke another user's session.
    if (!stored || stored.userId !== userId) {
      throw new BadRequestException('Invalid refresh token');
    }

    if (!stored.revoked) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      });
    }

    return { message: 'Signed out' };
  }

  /**
   * Issues a password-reset token.
   *
   * Always returns the same message whether or not the email matches an
   * account — otherwise this endpoint becomes a way to enumerate which email
   * addresses are registered.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Unknown address, or an invited user who never set a password — nothing
    // to reset in either case, but the caller cannot tell the difference.
    if (!user || user.status !== 'ACTIVE') {
      return genericResponse;
    }

    const rawToken = generateToken();

    await this.prisma.$transaction(async (tx) => {
      // Any earlier unused token for this user stops working the moment a new
      // one is requested.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: expiryInMinutes(PASSWORD_RESET_TOKEN_TTL_MINUTES),
        },
      });
    });

    try {
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    } catch (error) {
      // Deliberately swallowed. Every other path through this method returns
      // the same generic response, so letting a send failure surface as a 500
      // would turn this endpoint back into the enumeration oracle the generic
      // response exists to prevent: unknown address → 200, real address whose
      // email failed → 500. The token is already stored; the user can ask for
      // another one.
      this.logger.error(
        `Password reset email failed to send: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return genericResponse;
  }

  /**
   * Redeems a password-reset token. Signs the user out of every existing
   * session, since a password reset usually means the old one was compromised.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, password, confirmPassword } = dto;

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
    });

    return { message: 'Password has been reset. Please sign in again.' };
  }

  /**
   * Closes the caller's own account.
   *
   * Soft, for the same reason UsersService.delete is: the attendance and pay
   * records hanging off this user are evidence that has to outlive them. Nobody
   * can delete their way out of a payroll dispute.
   */
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status === 'DELETED') {
      throw new UnprocessableEntityException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date() },
      });

      // Every live way back in goes with the account: sessions, an unused
      // invitation, and any reset link already sitting in their inbox.
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });

      await tx.activationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    return { message: 'Account deleted successfully.' };
  }

  /**
   * `familyId` defaults to a fresh id, so every caller that starts a NEW
   * session — login, org verification, invite activation — gets its own family
   * without having to think about it. Only `refresh` passes one in, carrying
   * the existing session's chain forward.
   */
  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    familyId: string = randomUUID(),
  ) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: jwtAccessSecret(),
        expiresIn: jwtAccessExpiry() as JwtSignOptions['expiresIn'],
      },
    );

    // `jti` is not decoration. Without it the payload is just
    // { sub, email, role } plus JWT's own `iat`, which has one-second
    // resolution — so two logins by the same user inside the same second
    // produce byte-identical tokens, an identical SHA-256, and a unique
    // constraint violation on tokenHash (a 500 to the caller). That is a
    // double-clicked sign-in button, and it reached us as a real failure.
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: jwtRefreshSecret(),
        expiresIn: jwtRefreshExpiry() as JwtSignOptions['expiresIn'],
      },
    );

    // Only the digest is persisted — the raw refresh token exists solely in
    // this response and in the client's storage.
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId,
        familyId,
        expiresAt: expiryInDays(REFRESH_TOKEN_TTL_DAYS),
      },
    });

    return { accessToken, refreshToken };
  }
}
