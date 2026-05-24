import { supabase } from './supabase';

const BUCKET = 'customer-files';

export type UploadResult =
  | { url: string; error: null }
  | { url: null; error: string };

// ── Auth precheck ─────────────────────────────────────────────────────────────
async function assertSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? null : 'session_expired';
}

// ── WO Photo upload ───────────────────────────────────────────────────────────
export async function uploadPhotoToStorage(
  file: File | Blob,
  jobId: string,
  photoId: string,
): Promise<UploadResult> {
  const authErr = await assertSession();
  if (authErr) return { url: null, error: authErr };

  const ext =
    file instanceof File && file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `wo-photos/${jobId}/${photoId}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });

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

  const path = `avatars/${userId}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.error('[photoStorage] avatar upload failed', error);
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
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
