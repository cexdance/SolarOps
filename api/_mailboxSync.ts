import { createHash, randomUUID } from 'node:crypto';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { type MailboxConfig } from './_mailbox';
import { configuredMailbox, mailboxDb, mailboxRpc } from './_mailboxStore';
import { emailStorageId, newMailCheckpoint, nextUidWindow, type FolderCheckpoint } from './_mailboxSyncPlan';

const MAX_BYTES = 15 * 1024 * 1024;
const BATCH_SIZE = 10;
function clientFor(mailbox: MailboxConfig) {
  const client = new ImapFlow({ host: mailbox.imapHost, port: 993, secure: true,
    auth: { user: mailbox.email, pass: mailbox.password },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    logger: false, disableAutoIdle: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
  client.on('error', () => {});
  return client;
}

export async function startNewMailSync() {
  const mailbox = await configuredMailbox();
  const existing = await mailboxDb('rest/v1/mailbox_sync_state?id=eq.primary&select=mailbox_email,folders&limit=1');
  if (existing[0]) {
    if (existing[0].mailbox_email !== mailbox.email) throw new Error('Mailbox address changed.');
    await mailboxRpc('mailbox_sync_start', { p_email: mailbox.email, p_folders: existing[0].folders });
    return;
  }
  const client = clientFor(mailbox);
  const deadline = setTimeout(() => client.close(), 25000);
  try {
    await client.connect();
    const listed = await client.list();
    const sent = listed.find(folder => folder.specialUse === '\\Sent');
    if (!sent) throw new Error('Sent folder was not detected.');
    const folders: Record<string, FolderCheckpoint> = {};
    for (const [path, direction] of [['INBOX', 'inbound'], [sent.path, 'outbound']] as const) {
      const status = await client.status(path, { uidNext: true, uidValidity: true });
      if (!status || !status.uidValidity || !status.uidNext) throw new Error('Unable to initialize folder.');
      folders[path] = newMailCheckpoint(status.uidValidity, status.uidNext, direction);
    }
    await mailboxRpc('mailbox_sync_start', { p_email: mailbox.email, p_folders: folders });
  } finally { clearTimeout(deadline); client.close(); }
}

async function messageRecord(client: ImapFlow, mailbox: MailboxConfig, folder: string, checkpoint: FolderCheckpoint, info: FetchMessageObject) {
  const envelope = info.envelope;
  const fallback = `${folder}:${checkpoint.uidValidity}:${info.uid}`;
  const base = {
    message_id: envelope?.messageId || null,
    subject: envelope?.subject || '',
    message_date: info.internalDate instanceof Date ? info.internalDate.toISOString() : (envelope?.date ? new Date(envelope.date).toISOString() : null),
    direction: checkpoint.direction,
  };
  if (info.size > MAX_BYTES) return {
    ...base, id: emailStorageId(mailbox.email, envelope?.messageId, fallback), raw_path: null,
    content_status: 'too_large', payload: { folder, uid: info.uid, size: info.size, from: envelope?.from || [], to: envelope?.to || [], error: 'Message exceeds 15 MB; original remains in IONOS.' },
  };
  const fetched = await client.fetchOne(info.uid, { source: { start: 0, maxLength: MAX_BYTES + 1 } }, { uid: true });
  if (!fetched || !fetched.source) throw new Error('Message disappeared during fetch; retry required.');
  const source = fetched.source;
  if (source.length > MAX_BYTES) throw new Error('Message exceeds size limit.');
  const hash = createHash('sha256').update(source).digest('hex');
  const parsed = await simpleParser(source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  const id = emailStorageId(mailbox.email, parsed.messageId || envelope?.messageId, hash);
  const rawPath = `primary/${id}/${hash}.eml`;
  // The original MIME retains attachments and HTML for the conversation stage.
  // Only backend credentials can access this private bucket.
  await mailboxDb(`storage/v1/object/mailbox-originals/${rawPath}`, { method: 'POST', headers: { 'Content-Type': 'message/rfc822', 'x-upsert': 'true' }, body: new Uint8Array(source) as unknown as BodyInit });
  return { ...base, id, message_id: parsed.messageId || base.message_id, subject: parsed.subject || base.subject, raw_path: rawPath, content_status: 'complete', payload: {
    folder, uid: info.uid, size: info.size, from: parsed.from?.value || [],
    to: Array.isArray(parsed.to) ? parsed.to.flatMap(address => address.value) : parsed.to?.value || [],
    cc: Array.isArray(parsed.cc) ? parsed.cc.flatMap(address => address.value) : parsed.cc?.value || [],
    inReplyTo: parsed.inReplyTo || null, references: parsed.references || [],
    text: (parsed.text || '').slice(0, 200000), hasHtml: !!parsed.html,
    attachments: parsed.attachments.map(a => ({ filename: a.filename || 'attachment', contentType: a.contentType, size: a.size, checksum: a.checksum })),
  } };
}

export async function runMailboxSync() {
  const token = randomUUID();
  const rows = await mailboxRpc('mailbox_sync_claim', { p_token: token });
  const state = rows[0];
  if (!state) return { status: 'paused_or_busy', processed: 0 };
  let client: ImapFlow | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let processed = 0;
  try {
    const mailbox = await configuredMailbox();
    if (mailbox.email !== state.mailbox_email) throw new Error('MAILBOX_CHANGED');
    client = clientFor(mailbox);
    const deadline = Date.now() + 20000;
    timer = setTimeout(() => client?.close(), 25000);
    await client.connect();
    // Ten messages per folder prevents a busy Inbox from starving Sent Items.
    for (const [folder, checkpoint] of Object.entries(state.folders) as [string, FolderCheckpoint][]) {
      if (Date.now() >= deadline) break;
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        if (!client.mailbox) throw new Error('Mailbox unavailable.');
        const window = nextUidWindow(checkpoint, client.mailbox.uidValidity, client.mailbox.uidNext);
        if (!window) continue;
        const found = await client.search({ uid: `${window.start}:${window.end}` }, { uid: true });
        if (!found) throw new Error('IMAP search failed.');
        const uids = found.filter(uid => uid >= window.start && uid <= window.end).sort((a,b) => a-b).slice(0, BATCH_SIZE);
        let cursor = checkpoint.cursor;
        const messages = [];
        for (const uid of uids) {
          if (Date.now() >= deadline) break;
          const info = await client.fetchOne(uid, { envelope: true, size: true, internalDate: true }, { uid: true });
          if (info) messages.push(await messageRecord(client, mailbox, folder, checkpoint, info));
          cursor = uid;
        }
        if (!uids.length) cursor = window.end;
        // Advance only with the messages stored atomically under the current lease.
        await mailboxRpc('mailbox_sync_commit', { p_token: token, p_folder: folder, p_validity: checkpoint.uidValidity, p_cursor: cursor, p_messages: messages });
        processed += messages.length;
      } finally { lock.release(); }
    }
    await mailboxRpc('mailbox_sync_finish', { p_token: token, p_error: null, p_pause: false });
    return { status: 'synced', processed };
  } catch (error) {
    const pause = error instanceof Error && ['FOLDER_RESET', 'MAILBOX_CHANGED'].includes(error.message);
    await mailboxRpc('mailbox_sync_finish', { p_token: token, p_error: pause ? 'Mailbox or folder identity changed. Synchronization paused for review.' : 'Synchronization failed. Saved progress is retained for retry.', p_pause: pause });
    throw new Error('Mailbox synchronization failed.');
  } finally { if (timer) clearTimeout(timer); client?.close(); }
}
