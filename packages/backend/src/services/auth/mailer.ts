import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config.js';
import { logger } from '../../logging/logger.js';

/**
 * Outgoing mail for the first login flow.
 *
 * With SMTP configured the message is delivered normally. Without it - the
 * usual state on a developer machine - the message is written to the log so the
 * flow can still be walked end to end. That fallback is refused in production,
 * where a silently undelivered reset link would look like a working feature.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter === null) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user === ''
          ? undefined
          : { user: config.smtp.user, pass: config.smtp.password },
    });
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!config.smtp.configured) {
    if (config.isProduction) {
      throw new Error(
        'SMTP is not configured, so the email cannot be delivered. Set SMTP_HOST and related variables.'
      );
    }
    // Development only. The body carries the reset link, which is exactly what
    // the developer needs, and never leaves this machine.
    logger.warn(
      'SMTP is not configured; printing the email instead of sending it',
      { to: mail.to, subject: mail.subject }
    );
    logger.info(`\n--- email preview ---\n${mail.text}\n--- end ---`);
    return;
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

export function buildPasswordSetupEmail(options: {
  name: string;
  link: string;
  expiryMinutes: number;
}): Omit<Mail, 'to'> {
  const { name, link, expiryMinutes } = options;

  const text = [
    `Hi ${name},`,
    '',
    'Use the link below to set your password for the Student Portal:',
    link,
    '',
    `This link expires in ${expiryMinutes} minutes and can be used once.`,
    "If you didn't request this, ignore this email.",
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin: 0 0 4px; font-size: 20px;">Reset Your Password</h2>
      <p style="margin: 0 0 18px; color: #6b7280;">Student Portal</p>
      <p>Hi ${name},</p>
      <p>Click the button below to set your password:</p>
      <p style="margin: 22px 0;">
        <a href="${link}"
           style="background:#ff8c00;color:#fff;padding:12px 22px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;">
          Reset Your Password
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px;">
        This link expires in ${expiryMinutes} minutes and can be used once.<br />
        If you didn't request this, ignore this email.
      </p>
    </div>
  `;

  return { subject: 'Reset Your Password - Student Portal', text, html };
}
