/**
 * Resize and re-encode a user-supplied image File to a JPEG dataURL.
 *
 * Phone photos arrive as 3–8 MB JPEGs (or HEIC auto-converted by Safari).
 * Stored verbatim as base64, a single Work Order with 5 photos blows past
 * Supabase's practical row/upsert size, which silently kills every sync push.
 * Compressing to a max edge of 1600px @ 0.75 quality drops each photo to
 * ~150–300 KB while staying visually lossless for documentation use.
 */
export async function compressImageToDataUrl(
  file: File,
  maxEdge = 1600,
  quality = 0.75,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return await fileToDataUrl(file);
  }

  // HEIC/HEIF: Canvas cannot decode these on non-WebKit engines (iOS Chrome).
  // Fall back to FileReader so callers still get a usable dataURL.
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return await fileToDataUrl(file);
  }

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
    // Any canvas/decode failure — fall back to raw dataURL
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
 * Use this when you only need a Blob for upload — saves ~33% memory vs
 * compressImageToDataUrl + fetch(dataUrl).blob().
 */
export async function compressImageToBlob(
  file: File,
  maxEdge = 1600,
  quality = 0.75,
): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;

  // HEIC/HEIF: iOS camera default. iOS Safari auto-converts when reading from the
  // Photos library, but iOS Chrome may give raw HEIC. Canvas cannot decode HEIC —
  // skip compression and upload the original file directly.
  if (file.type === 'image/heic' || file.type === 'image/heif') return file;

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
    // — upload the original file rather than failing the whole operation.
    return file;
  }
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
