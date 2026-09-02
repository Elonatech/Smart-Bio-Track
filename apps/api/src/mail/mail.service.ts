import { Injectable, Logger } from '@nestjs/common';
import {
  APP_WEB_URL,
  BREVO_API_KEY,
  BREVO_API_URL,
  BREVO_BCC_RECIPIENTS,
  BREVO_REPLY_TO_EMAIL,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME,
} from './mail.constants';

interface MailRecipient {
  email: string;
  name?: string;
}

interface BrevoEmailPayload {
  sender: { email: string; name: string };
  to: MailRecipient[];
  subject: string;
  htmlContent: string;
  bcc?: MailRecipient[];
  replyTo?: MailRecipient;
}

/**
 * Anything interpolated into an email body is escaped first. Values like an
 * organization name are user-supplied, and while an email client is a far less
 * dangerous place to land markup than a browser, unescaped input still breaks
 * the layout the moment someone's company name contains an ampersand.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared shell for every email we send. Inline styles only — email clients
 * strip <style> blocks and have no useful CSS support beyond this.
 */
function layout(heading: string, body: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">${heading}</h1>
      ${body}
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;" />
      <p style="font-size: 12px; color: #666; margin: 0;">
        ${escapeHtml(BREVO_SENDER_NAME)}
      </p>
    </div>
  `;
}

function button(href: string, label: string): string {
  return `
    <p style="margin: 24px 0;">
      <a href="${href}" style="background: #1a6dff; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 6px; display: inline-block;">
        ${escapeHtml(label)}
      </a>
    </p>
    <p style="font-size: 13px; color: #666;">
      If the button does not work, paste this into your browser:<br />
      <span style="word-break: break-all;">${href}</span>
    </p>
  `;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /**
   * Sends one transactional email through Brevo.
   *
   * Throws on failure rather than logging and returning quietly — a caller
   * that has just written a pending signup row needs to know the link never
   * went out, otherwise the user waits forever for an email nobody sent.
   */
  async sendEmail(
    to: MailRecipient[],
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    const recipients = to.map((r) => r.email).join(', ');
    const startedAt = Date.now();

    const payload: BrevoEmailPayload = {
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      to,
      subject,
      htmlContent,
    };

    if (BREVO_BCC_RECIPIENTS.length > 0) {
      payload.bcc = BREVO_BCC_RECIPIENTS;
    }

    if (BREVO_REPLY_TO_EMAIL) {
      payload.replyTo = { email: BREVO_REPLY_TO_EMAIL };
    }

    let response: Response;

    try {
      response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': BREVO_API_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Network-level failure — Brevo unreachable, DNS, timeout.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not reach Brevo: ${reason}`);
      throw new Error('Failed to send email');
    }

    if (!response.ok) {
      // Read as text, not json — an error body is not guaranteed to be JSON,
      // and response.json() returns `any`, which the lint rules reject.
      const body = await response.text();
      this.logger.error(
        `Brevo rejected the email (${response.status}): ${body}`,
      );
      throw new Error('Failed to send email');
    }

    // One line per send, on success only. The failure paths above log their
    // own reason, so an attempt that produces nothing here has already said
    // why at error level.
    this.logger.log(
      `Sent "${subject}" to ${recipients} (${Date.now() - startedAt}ms)`,
    );
  }

  /**
   * Step one of self-service org signup — the link lands on the frontend page
   * that collects organization name, admin name, and industry, which then
   * calls POST /auth/verify-organization with this token.
   */
  async sendOrganizationVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const link = `${APP_WEB_URL}/verify-organization?token=${encodeURIComponent(token)}`;

    const html = layout(
      'Verify your email',
      `
        <p>Thanks for signing up. Confirm this address to finish setting up your organization.</p>
        ${button(link, 'Verify and continue')}
        <p style="font-size: 13px; color: #666;">
          This link expires in 7 days. If you did not sign up, you can ignore this email.
        </p>
      `,
    );

    await this.sendEmail(
      [{ email }],
      'Verify your email to finish registering',
      html,
    );
  }

  /**
   * Sent when an admin provisions a staff account. The invitee sets their own
   * password at this link — we never create one for them, so there is no
   * temporary password to leak.
   */
  async sendActivationEmail(
    email: string,
    token: string,
    organizationName: string,
  ): Promise<void> {
    const link = `${APP_WEB_URL}/complete-registration?token=${encodeURIComponent(token)}`;

    const html = layout(
      'Activate your account',
      `
        <p>${escapeHtml(organizationName)} has created an account for you on ${escapeHtml(BREVO_SENDER_NAME)}. Set a password to activate it.</p>
        ${button(link, 'Set my password')}
        <p style="font-size: 13px; color: #666;">
          This link expires in 7 days.
        </p>
      `,
    );

    await this.sendEmail([{ email }], 'Activate your account', html);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const link = `${APP_WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;

    const html = layout(
      'Reset your password',
      `
        <p>We received a request to reset your password.</p>
        ${button(link, 'Reset password')}
        <p style="font-size: 13px; color: #666;">
          This link expires in 30 minutes. If you did not request this, ignore
          this email — your password will not change.
        </p>
      `,
    );

    await this.sendEmail([{ email }], 'Reset your password', html);
  }
}
