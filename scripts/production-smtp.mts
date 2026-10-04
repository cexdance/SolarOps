import nodemailer from 'nodemailer';
export interface SmtpSettings { host: string; port: number; security: 'tls' | 'starttls'; user: string; password: string; from: string }
export function validateSmtp(config: SmtpSettings) {
  if (!/^[a-zA-Z0-9.-]+$/.test(config.host) || config.host.length > 253) throw new Error('Enter the SMTP server hostname');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Enter a valid SMTP port');
  if (!['tls', 'starttls'].includes(config.security)) throw new Error('Encrypted SMTP is required');
  if (!config.user || /[\r\n]/.test(config.user) || !config.password) throw new Error('SMTP username and password are required');
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(config.from)) throw new Error('Enter a sender email address');
}
export function smtpTransport(config: SmtpSettings) {
  validateSmtp(config);
  return nodemailer.createTransport({ host: config.host, port: config.port, secure: config.security === 'tls', requireTLS: true, auth: { user: config.user, pass: config.password }, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
}
export function smtpFromEnv(): SmtpSettings {
  const config = { host: (process.env.SMTP_HOST || '').trim(), port: Number(process.env.SMTP_PORT), security: process.env.SMTP_SECURITY as SmtpSettings['security'], user: (process.env.SMTP_USER || '').trim(), password: process.env.SMTP_PASSWORD || '', from: (process.env.SMTP_FROM || '').trim() };
  validateSmtp(config); return config;
}
