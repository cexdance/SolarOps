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
