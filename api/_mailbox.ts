import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

export interface MailboxConfig {
  email: string;
  password: string;
  smtpHost: string;
  smtpPort: 465 | 587;
  imapHost: string;
}

const regions = ['com', 'co.uk', 'ca', 'de', 'fr', 'es', 'it'];
export function validateMailbox(input: unknown): MailboxConfig {
  const value = input as Partial<MailboxConfig> | null;
  if (!value || typeof value.email !== 'string' || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.email.trim())) throw new Error('Enter a valid mailbox email address.');
  if (typeof value.password !== 'string' || !value.password || value.password.length > 1024) throw new Error('Enter the mailbox password.');
  if (!regions.some(region => value.smtpHost === `smtp.ionos.${region}` && value.imapHost === `imap.ionos.${region}`)) throw new Error('Choose matching IONOS SMTP and IMAP servers.');
  if (value.smtpPort !== 465 && value.smtpPort !== 587) throw new Error('Use SMTP port 465 or 587.');
  return { email: value.email.trim().toLowerCase(), password: value.password, smtpHost: value.smtpHost!, smtpPort: value.smtpPort, imapHost: value.imapHost! };
}

function encryptionKey(key: string) {
  if (!/^[a-f\d]{64}$/i.test(key)) throw new Error('Mailbox encryption is not configured.');
  return Buffer.from(key, 'hex');
}
export function encryptMailbox(config: MailboxConfig, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from('solarops:shared-mailbox:v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptMailbox(value: string, key: string): MailboxConfig {
  const [version, iv, tag, data, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid mailbox configuration.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from('solarops:shared-mailbox:v1'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return validateMailbox(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')));
}

export function mailboxFromEnv(env: NodeJS.ProcessEnv): MailboxConfig | null {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) return null;
  const smtpHost = (env.SMTP_HOST || '').trim();
  return validateMailbox({ email: env.SMTP_USER.trim(), password: env.SMTP_PASSWORD, smtpHost, smtpPort: Number(env.SMTP_PORT || 465), imapHost: (env.IMAP_HOST || smtpHost.replace(/^smtp\./, 'imap.')).trim() });
}

export interface MailboxCheck {
  smtp: { ok: boolean; error?: string };
  imap: { ok: boolean; error?: string; messages?: number; sentFolder?: string | null };
  checkedAt: string;
}

// Authentication checks only: no messages sent, fetched, marked read, or deleted.
export async function checkMailbox(config: MailboxConfig): Promise<MailboxCheck> {
  validateMailbox(config);
  const smtp = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
    requireTLS: true, auth: { user: config.email, pass: config.password },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
  const imap = new ImapFlow({
    host: config.imapHost, port: 993, secure: true,
    auth: { user: config.email, pass: config.password },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, disableAutoIdle: true,
  });
  // ImapFlow may also emit an error event; never log the provider's raw error.
  imap.on('error', () => {});
  const deadline = setTimeout(() => { smtp.close(); imap.close(); }, 25000);
  try {
    const [outgoing, incoming] = await Promise.allSettled([
      smtp.verify(),
      (async () => {
        await imap.connect();
        const status = await imap.status('INBOX', { messages: true });
        if (!status) throw new Error('Inbox status unavailable.');
        const folders = await imap.list();
        return { messages: status.messages || 0, sentFolder: folders.find(folder => folder.specialUse === '\\Sent')?.path || null };
      })(),
    ]);
    return {
      smtp: outgoing.status === 'fulfilled' ? { ok: true } : { ok: false, error: 'SMTP connection failed. Check credentials, server and port.' },
      imap: incoming.status === 'fulfilled' ? { ok: true, ...incoming.value } : { ok: false, error: 'IMAP connection failed. Check credentials and IMAP availability.' },
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(deadline);
    smtp.close();
    imap.close();
  }
}

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Send one message through the shared IONOS mailbox.
 *
 * Same TLS and timeout hardening as checkMailbox, and the same rule about
 * errors: the provider's raw message can carry the mailbox address and
 * credentials, so callers get a flat failure and the detail goes to the log.
 */
export async function sendMailboxMessage(config: MailboxConfig, msg: OutgoingMessage): Promise<void> {
  validateMailbox(config);
  const smtp = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
    requireTLS: true, auth: { user: config.email, pass: config.password },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    await smtp.sendMail({
      from: config.email,
      to: msg.to,
      replyTo: config.email,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: msg.attachments,
    });
  } finally {
    smtp.close();
  }
}
