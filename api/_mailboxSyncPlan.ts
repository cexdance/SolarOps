import { createHash } from 'node:crypto';
export interface FolderCheckpoint { uidValidity: string; cursor: number; direction: 'inbound' | 'outbound' }
export function newMailCheckpoint(uidValidity: bigint | string, uidNext: number, direction: FolderCheckpoint['direction']): FolderCheckpoint {
  if (!Number.isSafeInteger(uidNext) || uidNext < 1) throw new Error('Invalid folder UIDNEXT');
  return { uidValidity: String(uidValidity), cursor: uidNext - 1, direction };
}
export function nextUidWindow(checkpoint: FolderCheckpoint, uidValidity: bigint | string, uidNext: number) {
  if (checkpoint.uidValidity !== String(uidValidity)) throw new Error('FOLDER_RESET');
  if (!Number.isSafeInteger(uidNext) || uidNext < 1 || !Number.isSafeInteger(checkpoint.cursor) || checkpoint.cursor < 0) throw new Error('Invalid folder cursor');
  const end = Math.min(uidNext - 1, checkpoint.cursor + 500);
  return end > checkpoint.cursor ? { start: checkpoint.cursor + 1, end } : null;
}
export function emailStorageId(email: string, messageId: string | undefined, rawHash: string) {
  // Same RFC Message-ID in Inbox and Sent Items is one email. ID-less messages
  // use the original MIME hash; checkpoints still advance for every folder UID.
  return createHash('sha256').update(`${email.toLowerCase()}\n${messageId?.trim() || rawHash}`).digest('hex');
}
