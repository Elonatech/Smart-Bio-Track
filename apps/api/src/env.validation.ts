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
