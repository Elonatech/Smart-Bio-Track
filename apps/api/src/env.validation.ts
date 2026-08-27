import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string({ message: 'DATABASE_URL is required' })
    .url('DATABASE_URL must be a valid connection string'),
  PORT: z.coerce.number().int().positive().optional(),
  JWT_ACCESS_SECRET: z.string({
    message: 'JWT_ACCESS_SECRET is required',
  }),
  JWT_REFRESH_SECRET: z.string({
    message: 'JWT_REFRESH_SECRET is required',
  }),
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

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
