function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable not set: ${name}`);
  }
  return value;
}

/** Brevo's transactional email endpoint. */
export const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export const BREVO_API_KEY = requireEnv('BREVO_API_KEY');
export const BREVO_SENDER_EMAIL = requireEnv('BREVO_SENDER_EMAIL');
export const BREVO_SENDER_NAME =
  process.env.BREVO_SENDER_NAME || 'SmartBioTrack';

/**
 * Optional, and deliberately so — env.validation.ts marks both of these
 * optional, and a constants file that threw on a missing value it declares
 * optional would stop the API booting for anyone who left it out.
 */
export const BREVO_REPLY_TO_EMAIL = process.env.BREVO_REPLY_TO_EMAIL;

export const BREVO_BCC_RECIPIENTS = (process.env.BREVO_BCC_RECIPIENTS ?? '')
  .split(',')
  .map((email) => email.trim())
  .filter((email) => email.length > 0)
  .map((email) => ({ email }));

/**
 * Where the links in our emails point. This is the *frontend* origin, not the
 * API's — the user clicks through to a page, which then calls the API.
 */
export const APP_WEB_URL = process.env.APP_WEB_URL || 'http://localhost:3000';
