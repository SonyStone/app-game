import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDocument } from './document';
import { unpackBmp } from './unpackBmp';

afterEach(() => vi.unstubAllGlobals());

describe('typed document failures', () => {
  it('returns malformed container and empty-page errors without throwing', async () => {
    expect(unpackBmp(new ArrayBuffer(53))._unsafeUnwrapErr().code).toBe('invalid-data');
    mockAssets([]);
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code: 'invalid-data' });
  });

  it('distinguishes HTTP failures from rejected and synchronously throwing fetch calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code: 'http' });
    const cause = new TypeError('Network failure');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ code: 'load', cause });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw cause;
      })
    );
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ code: 'load', cause });
  });

  it('returns a decoding error for invalid JSON', async () => {
    mockAssets('{');
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code: 'decode' });
  });

  it('closes earlier images when a later bitmap cannot be decoded', async () => {
    mockAssets([pageWithImages('first.png', 'second.png')]);
    const close = vi.fn();
    const cause = new Error('Invalid image');
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce({ close }).mockRejectedValueOnce(cause));
    expect((await loadDocument())._unsafeUnwrapErr()).toMatchObject({ kind: 'document', code: 'decode', cause });
    expect(close).toHaveBeenCalledOnce();
  });

  it('treats cancellation during bitmap decoding as an expected result and closes the bitmap', async () => {
    mockAssets([pageWithImages('image.png')]);
    const abort = new AbortController();
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        abort.abort();
        return { close };
      })
    );
    expect((await loadDocument(abort.signal))._unsafeUnwrapErr().kind).toBe('aborted');
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not start requests when already cancelled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await loadDocument(AbortSignal.abort()))._unsafeUnwrapErr().kind).toBe('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });
});

function mockAssets(metadata: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('pages.json')) {
        return new Response(typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
      }
      if (url.includes('/images/')) {
        return new Response('image bytes');
      }
      const payload = url.includes('glyphs.bmp')
        ? 20
        : url.includes('atlasverts.bmp')
          ? 72
          : url.includes('imageverts.bmp')
            ? 0
            : 4;
      const buffer = new ArrayBuffer(54 + payload);
      const header = new DataView(buffer);
      header.setUint16(18, 1, true);
      header.setUint16(22, 1, true);
      return new Response(buffer);
    })
  );
}

function pageWithImages(...names: string[]) {
  return {
    width: 612,
    height: 792,
    beginVertex: 0,
    endVertex: 6,
    images: names.map((filename) => ({ filename, vertexOffset: 0, numVerts: 6 }))
  };
}
