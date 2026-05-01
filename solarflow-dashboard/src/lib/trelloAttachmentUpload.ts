// SolarOps — Trello Attachment Upload
// Downloads each attachment from Trello (authenticated) and re-hosts it in
// Supabase Storage so the URL is permanent and not gated behind Trello tokens.

import { supabase } from './supabase';

const BUCKET = 'customer-files';

async function ensureBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024, // 20 MB per file
  });
  // Ignore "already exists" — that's the happy path
  if (error && !error.message.toLowerCase().includes('already exist')) {
    throw error;
  }
}

let bucketReady = false;

async function getBucket(): Promise<void> {
  if (bucketReady) return;
  await ensureBucket();
  bucketReady = true;
}

/**
 * Download one Trello attachment and upload it to Supabase Storage.
 * Returns the permanent public URL, or null if anything fails.
 */
export async function uploadTrelloAttachment(opts: {
  trelloUrl: string;
  trelloKey: string;
  trelloToken: string;
  customerId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}): Promise<string | null> {
  const { trelloUrl, trelloKey, trelloToken, customerId, fileId, fileName, mimeType } = opts;

  try {
    // 1. Download the file from Trello (requires auth params)
    const fetchUrl = `${trelloUrl}?key=${trelloKey}&token=${trelloToken}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.warn(`[TrelloUpload] Download failed for "${fileName}": HTTP ${res.status}`);
      return null;
    }
    const blob = await res.blob();

    // 2. Ensure the bucket exists
    await getBucket();

    // 3. Upload to Supabase Storage under customers/{customerId}/{fileId}.{ext}
    const ext  = fileName.includes('.') ? fileName.split('.').pop()! : guessExt(mimeType);
    const path = `customers/${customerId}/${fileId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: mimeType || blob.type, upsert: true });

    if (uploadError) {
      console.warn(`[TrelloUpload] Upload failed for "${fileName}":`, uploadError.message);
      return null;
    }

    // 4. Return the permanent public URL
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn(`[TrelloUpload] Unexpected error for "${fileName}":`, err);
    return null;
  }
}

function guessExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/gif':  'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
    'video/mp4':  'mp4',
    'video/quicktime': 'mov',
  };
  return map[mimeType] ?? 'bin';
}
