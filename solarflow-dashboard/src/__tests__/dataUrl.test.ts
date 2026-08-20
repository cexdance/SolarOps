import { describe, it, expect } from 'vitest';
import { dataUrlToBlob } from '../lib/dataUrl';

// 1x1 transparent GIF, the smallest real image payload.
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('dataUrlToBlob', () => {
  it('decodes a base64 image and preserves the exact bytes', async () => {
    const blob = dataUrlToBlob(GIF);
    expect(blob.type).toBe('image/gif');
    const bytes = await bytesOf(blob);
    expect(blob.size).toBe(42);
    // GIF89a magic, proves we decoded rather than stored the base64 text.
    expect(Array.from(bytes.slice(0, 6))).toEqual([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  });

  it('keeps only the mime type, dropping base64 and other parameters', () => {
    expect(dataUrlToBlob('data:image/jpeg;charset=utf-8;base64,//8=').type).toBe('image/jpeg');
  });

  it('handles a non-base64 percent-encoded payload', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20world');
    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe('hello world');
  });

  it('defaults the mime type when the header is empty', () => {
    expect(dataUrlToBlob('data:;base64,//8=').type).toBe('application/octet-stream');
  });

  it('rejects anything that is not a data: URL', () => {
    expect(() => dataUrlToBlob('https://example.com/a.jpg')).toThrow('Not a data: URL');
    expect(() => dataUrlToBlob('data:image/gif;base64')).toThrow('Not a data: URL');
  });
});
