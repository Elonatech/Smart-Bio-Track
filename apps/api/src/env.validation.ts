import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string({ message: 'DATABASE_URL is required' })
    .url('DATABASE_URL must be a valid connection string'),
  PORT: z.coerce.number().int().positive().optional(),

  /**
   * Signing keys for the two token types.
   *
   * The 32-character floor is not decoration. `z.string()` alone accepts "x",
   * and the API would boot and sign tokens with it — an HS256 secret short
   * enough to brute-force offline, which lets anyone mint a token for any user
   * with any role. 32 characters is the practical minimum for HS256; both of
   * ours are 64-character hex, which is what `openssl rand -hex 32` produces
   * and what new environments should use.
   */
  JWT_ACCESS_SECRET: z
    .string({ message: 'JWT_ACCESS_SECRET is required' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string({ message: 'JWT_REFRESH_SECRET is required' })
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  /**
   * Whether to publish the Swagger UI at /api/docs.
   *
   * Unset means "on unless NODE_ENV is production" (resolved in main.ts), so
   * local development is unchanged and a production deploy has to opt in
   * deliberately.
   *
   * Deliberately NOT `z.coerce.boolean()`: that coerces any non-empty string,
   * so ENABLE_API_DOCS="false" would parse as `true` and publish the docs in
   * production — the exact opposite of what whoever typed it intended. An
   * explicit enum makes "false" mean false and rejects a typo outright.
   */
  ENABLE_API_DOCS: z
    .enum(['true', 'false'], {
      message: 'ENABLE_API_DOCS must be exactly "true" or "false"',
    })
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),

  /**
   * Left optional because nothing sets it in local development — `nest start`
   * does not, so it is normally undefined here and 'test' under Jest. Every
   * check in the codebase therefore asks whether it *is* 'production' rather
   * than whether it is not.
   */
  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      message: "NODE_ENV must be one of 'development', 'test', 'production'",
    })
    .optional(),
  JWT_ACCESS_EXPIRY: z.string().optional(),
  JWT_REFRESH_EXPIRY: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  BREVO_API_KEY: z.string({
    message: 'BREVO_API_KEY is required',
  }),
  BREVO_SENDER_EMAIL: z.string().email({
    message: 'BREVO_SENDER_EMAIL must be a valid email address',
  }),
  BREVO_SENDER_NAME: z.string().optional(),
  BREVO_REPLY_TO_EMAIL: z
    .string()
    .email({ message: 'BREVO_REPLY_TO_EMAIL must be a valid email address' })
    .optional(),
  BREVO_BCC_RECIPIENTS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [];
      return val.split(',').map((email) => email.trim());
    }),

  /** Frontend origin that the links in our emails point at. */
  APP_WEB_URL: z.string().url('APP_WEB_URL must be a valid URL').optional(),

  /**
   * How many reverse proxies sit in front of this API.
   *
   * Rate limiting keys off the client IP, and behind a proxy (Render, Nginx)
   * Express reports the *proxy's* address unless it is told to read
   * X-Forwarded-For — which would put every user in one shared bucket.
   *
   * Set to 1 in any environment that is actually behind a proxy. Leave unset
   * (0) when the API is directly exposed: trusting the header while directly
   * reachable lets an attacker forge X-Forwarded-For and mint unlimited
   * rate-limit buckets, defeating the throttle entirely.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
});

/**
 * The two JWT secrets must be different keys, not one key used twice.
 *
 * This is a privilege-escalation bug, not a tidiness rule. An access token and
 * a refresh token carry the same payload shape ({ sub, email, role, jti }) and
 * differ only in which secret signed them and how long they last. JwtStrategy
 * authenticates a request by verifying the bearer token against
 * JWT_ACCESS_SECRET — so if the two secrets are equal, a *refresh* token
 * verifies as an access token.
 *
 * The consequence: anyone holding a refresh token could send it straight in an
 * Authorization header and be authenticated for seven days, instead of the
 * fifteen minutes an access token is meant to last. Every control built around
 * the short access-token lifetime quietly stops applying.
 *
 * Nothing else in the system can catch this — both values are individually
 * valid, and the app boots and behaves normally right up until someone notices.
 */
const validatedEnvSchema = envSchema.refine(
  (env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET,
  {
    path: ['JWT_REFRESH_SECRET'],
    message:
      'JWT_REFRESH_SECRET must not be the same value as JWT_ACCESS_SECRET — ' +
      'sharing one secret lets a refresh token authenticate as an access token.',
  },
);

export function validateEnv() {
  const result = validatedEnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
