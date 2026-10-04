import { describe, expect, it, vi } from 'vitest';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({})) } }));
import nodemailer from 'nodemailer';
import { smtpTransport, validateSmtp, type SmtpSettings } from '../../../scripts/production-smtp.mts';
const config: SmtpSettings = { host: 'smtp.example.com', port: 587, security: 'starttls', user: 'test', password: 'test', from: 'sender@example.com' };
describe('encrypted SMTP configuration', () => {
  it('requires STARTTLS and valid certificates without disabling protections', () => {
    smtpTransport(config); expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true }));
  });
  it('supports implicit TLS and rejects unsafe configuration', () => {
    smtpTransport({ ...config, port: 465, security: 'tls' }); expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true }));
    expect(() => validateSmtp({ ...config, security: 'none' } as never)).toThrow('Encrypted'); expect(() => validateSmtp({ ...config, from: 'sender@example.com\nBcc: other@example.com' })).toThrow(); expect(() => validateSmtp({ ...config, password: '' })).toThrow();
  });
});
