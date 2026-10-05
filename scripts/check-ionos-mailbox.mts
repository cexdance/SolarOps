/** Read the private setup file; print only connection results, never credentials. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkMailbox, validateMailbox } from '../api/_mailbox.ts';

try {
  const saved = JSON.parse(readFileSync(join(homedir(), '.executor', 'solarops-smtp.json'), 'utf8'));
  const config = validateMailbox({ email: saved.user, password: saved.password, smtpHost: saved.host, smtpPort: saved.port, imapHost: saved.host.replace(/^smtp\./, 'imap.') });
  const checks = await checkMailbox(config);
  console.log(JSON.stringify(checks, null, 2));
  if (!checks.smtp.ok || !checks.imap.ok) process.exitCode = 1;
} catch {
  console.error('Mailbox check unavailable. Verify the private SMTP setup file and IONOS configuration.');
  process.exitCode = 1;
}
