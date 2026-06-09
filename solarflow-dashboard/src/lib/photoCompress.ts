/**
 * Resize and re-encode a user-supplied image File to a JPEG dataURL.
 *
 * Phone photos arrive as 3-8 MB JPEGs (or HEIC auto-converted by Safari).
 * Stored verbatim as base64, a single Work Order with 5 photos blows past
 * Supabase's practical row/upsert size, which silently kills every sync push.
 * Compressing to a max edge of 1600px @ 0.75 quality drops each photo to
 * ~150-300 KB while staying visually lossless for documentation use.
 */
export async function compressImageToDataUrl(
  file: File,
  maxEdge = 1600,
  quality = 0.75,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return await fileToDataUrl(file);
  }

  // NOTE: do NOT preemptively bail on HEIC/HEIF. iPhone photos are HEIC by
  // default, and bailing stored the RAW multi-MB file as base64, a single
  // photo could blow the ~5MB localStorage cap and trigger "Storage full".
  // loadBitmap() decodes HEIC on iOS Safari via createImageBitmap/<img>; the
  // catch below falls back to the raw file only if decoding genuinely fails.
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return await fileToDataUrl(file);
    }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }

    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    // Any canvas/decode failure, fall back to raw dataURL
    return await fileToDataUrl(file);
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> path (e.g. Safari with some HEIC variants)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaleToFit(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const ratio = maxEdge / longest;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress a File to a Blob (JPEG) without the base64 round-trip.
 * Use this when you only need a Blob for upload, saves ~33% memory vs
 * compressImageToDataUrl + fetch(dataUrl).blob().
 */
export async function compressImageToBlob(
  file: File,
  maxEdge = 1600,
  quality = 0.75,
): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;

  // Do NOT preemptively bail on HEIC/HEIF, loadBitmap decodes it on iOS Safari
  // via createImageBitmap/<img>, and the catch below uploads the original file
  // only if decoding genuinely fails. Compressing keeps the upload payload small.
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }

    const blob = await new Promise<Blob | null>(res => {
      canvas.toBlob(res, 'image/jpeg', quality);
    });
    // canvas.toBlob returns null on iOS when memory is low or the image type is
    // unsupported by the GPU compositor. Fall back to the original file.
    return blob ?? file;
  } catch {
    // Any compression error (HEIC decode failure, canvas SecurityError, etc.)
    //, upload the original file rather than failing the whole operation.
    return file;
  }
}

const ONE_MB = 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress an image so the result is GUARANTEED under `maxBytes` (default 1 MB)
 * whenever achievable. Non-images and already-small inputs pass through
 * unchanged. Steps down max edge, then JPEG quality, until under budget;
 * returns the smallest result achieved even if a stubborn image stays slightly
 * over. This is the hard cap applied before anything is committed to storage.
 */
export async function compressImageUnderBytes(
  input: File | Blob,
  maxBytes = ONE_MB,
): Promise<Blob> {
  if (!input.type.startsWith('image/')) return input;
  if (input.size <= maxBytes) return input;
  const file = input instanceof File
    ? input
    : new File([input], 'image', { type: input.type || 'image/jpeg' });
  let best: Blob = input;
  for (const edge of [1600, 1280, 1024, 800, 640]) {
    for (const q of [0.75, 0.6, 0.45, 0.3]) {
      const blob = await compressImageToBlob(file, edge, q);
      if (blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) return blob;
    }
  }
  return best;
}

/** Like compressImageUnderBytes but returns a JPEG dataURL under `maxBytes`. */
export async function compressImageToDataUrlUnder(
  file: File,
  maxBytes = ONE_MB,
): Promise<string> {
  if (!file.type.startsWith('image/')) return await fileToDataUrl(file);
  const blob = await compressImageUnderBytes(file, maxBytes);
  return await blobToDataUrl(blob);
}

/** Approximate decoded byte length of a data:*;base64 URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl.startsWith('data:')) return dataUrl.length;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  const padding = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - padding);
}

/**
 * Recompress an existing dataURL through the same canvas pipeline.
 * Returns null if input isn't a recognized base64 image dataURL or if
 * the compressed result wouldn't be smaller (so callers can skip writes).
 */
export async function recompressDataUrl(
  dataUrl: string,
  maxEdge = 1600,
  quality = 0.75,
): Promise<string | null> {
  if (!dataUrl.startsWith('data:image/')) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'photo', { type: blob.type || 'image/jpeg' });
    const next = await compressImageToDataUrl(file, maxEdge, quality);
    if (next.length >= dataUrl.length) return null;
    return next;
  } catch {
    return null;
  }
}
