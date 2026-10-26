import { createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createPsdDocument } from '../src/features/document/createPsdDocument';
import type { PsdClient } from '../src/features/psd-worker';

it('cancels a source read immediately and ignores its late completion after a restart', async () => {
  let finish!: (bytes: ArrayBuffer) => void;
  const read = new Promise<ArrayBuffer>((resolve) => {
    finish = resolve;
  });
  const open = vi
    .fn<PsdClient['open']>()
    .mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'next result' } });
  const restart = vi.fn();
  const session = createRoot((dispose) => ({ ...createPsdDocument({ open, restart }), dispose }));
  try {
    session.open({ name: 'slow.psd', read: () => read });
    flush();
    expect(session.opening()).toBe(true);
    session.cancel();
    flush();
    expect(session.canceled()).toBe(true);
    expect(session.opening()).toBe(false);
    expect(session.opened()).toBeUndefined();
    session.open({ name: 'next.psd', read: async () => new ArrayBuffer(26) });
    finish(new ArrayBuffer(80));
    await vi.waitFor(() => {
      flush();
      expect(session.opening()).toBe(false);
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0].byteLength).toBe(26);
    expect(session.source()?.name).toBe('next.psd');
    expect(session.opened()).toMatchObject({ ok: false, error: { message: 'next result' } });
  } finally {
    session.dispose();
  }
});
