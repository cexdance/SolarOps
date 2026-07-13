import { supabase } from './supabase';
import { compressImageUnderBytes } from './photoCompress';

const BUCKET = 'customer-files';

export type UploadResult =
  | { url: string; error: null }
  | { url: null; error: string };

// ── Auth precheck ─────────────────────────────────────────────────────────────
async function assertSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? null : 'session_expired';
}

/** sha-256 of the blob bytes as a 16-hex-char id, e.g. "ph-a1b2c3d4e5f60718". */
async function contentHashId(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest).slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `ph-${hex}`;
}

// ── WO Photo upload ───────────────────────────────────────────────────────────
export async function uploadPhotoToStorage(
  file: File | Blob,
  jobId: string,
  photoId: string,
): Promise<UploadResult> {
  const authErr = await assertSession();
  if (authErr) return { url: null, error: authErr };

  // Auto-downscale/recompress any oversized image to < 1 MB before upload.
  // Non-image files (PDFs) upload as-is; the image pipeline would reject them.
  const isImage = !file.type || file.type.startsWith('image/');
  const toUpload = isImage ? await compressImageUnderBytes(file).catch(() => file) : file;
  const ext =
    toUpload instanceof File && toUpload.name.includes('.') ? toUpload.name.split('.').pop() : 'jpg';
  // Content-addressed key: same bytes always land on the SAME storage object,
  // so a double-tap, an upload retry, or a second upload path can never mint a
  // second public URL for the same photo. Every downstream dedupe keys on the
  // URL stem, so collapsing identical bytes to one URL kills the duplicate-photo
  // class at the source (SO-2605-25309: 7 of 15 photos were byte-identical twins
  // under two storage keys). Falls back to photoId if hashing fails.
  const objectId = await contentHashId(toUpload).catch(() => photoId) ?? photoId;
  const path = `wo-photos/${jobId}/${objectId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, { contentType: toUpload.type || 'image/jpeg', upsert: true });

  if (error) {
    console.error('[photoStorage] upload failed', error);
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ── Avatar upload ─────────────────────────────────────────────────────────────
export async function uploadAvatarToStorage(
  file: File | Blob,
  userId: string,
): Promise<UploadResult> {
  const authErr = await assertSession();
  if (authErr) return { url: null, error: authErr };

  const toUpload = await compressImageUnderBytes(file).catch(() => file);
  const path = `avatars/${userId}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.error('[photoStorage] avatar upload failed', error);
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ── Inline→Storage migration helper ──────────────────────────────────────────
/**
 * One-shot migration: if the given string is a base64 dataUrl, upload it to
 * Storage and return the public URL. If it's already a URL, return it as-is.
 * Call this lazily on first read for any photo that's still a dataUrl.
 */
export async function migrateInlinePhoto(
  dataUrl: string,
  jobId: string,
): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a storage URL
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const photoId = `mig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const result = await uploadPhotoToStorage(blob, jobId, photoId);
    return result.url ?? dataUrl; // fall back to dataUrl if upload fails
  } catch {
    return dataUrl; // non-fatal, return original
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deletePhotoFromStorage(storageUrl: string): Promise<void> {
  const marker = '/object/public/' + BUCKET + '/';
  const idx = storageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = storageUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('[photoStorage] delete failed', error);
}
