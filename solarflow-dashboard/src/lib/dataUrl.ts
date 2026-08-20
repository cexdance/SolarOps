/**
 * data: URL -> Blob, without fetch().
 *
 * `fetch(dataUrl)` is the obvious way to do this and it is blocked in
 * production: CSP `connect-src` in vercel.json has no `data:` entry, so the
 * browser refuses the request and throws a bare `TypeError: Failed to fetch`.
 * That surfaced to users as "1 of 1 file failed: Failed to fetch" on every
 * image pasted into Customer Notes.
 *
 * Decoding in-process is also just correct: a data: URL already holds the
 * bytes, so there was never anything to go fetch.
 */

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error('Not a data: URL');
  }
  const header = dataUrl.slice(5, comma);          // e.g. "image/jpeg;base64"
  const isBase64 = header.endsWith(';base64');
  const mimeType = (isBase64 ? header.slice(0, -';base64'.length) : header).split(';')[0] || 'application/octet-stream';
  const payload = dataUrl.slice(comma + 1);

  if (!isBase64) {
    // Percent-encoded text payload, rare but legal.
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
