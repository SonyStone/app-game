import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf } from '../psd-worker';

/** A file to open: its name for display, how to read its bytes, and rendering settings it was captured with. */
export type PsdSource = {
  name: string;
  read: () => Promise<ArrayBuffer>;
  /** Settings to apply with the document, such as the Color Settings an example was saved under. */
  settings?: PsdRenderSettings;
};

/**
 * Owns which document is open. `open` replaces the source; every call reopens, even for the same file. `opened` is
 * async: while a new document loads, the previous one stays committed and `isPending(opened)` is true, and it settles
 * to the worker's structure or a failure such as "not a Photoshop document". `undefined` before the first file.
 */
export function createPsdDocument(client: PsdClient) {
  const [source, setSource] = createSignal<PsdSource>();
  const opened = createMemo<PsdResultOf<OpenedPsd> | undefined>(() => {
    const current = source();
    return current ? readAndOpen(client, current) : undefined;
  });
  const open = (next: PsdSource) => setSource({ ...next });

  return { source, opened, open };
}

/**
 * Renders the open document whenever it, the settings or the visibility overrides change. The worker coalesces
 * renders, so only the newest of quick successive changes is composited after the one running.
 */
export function createPsdRender(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>
) {
  return createMemo(() => {
    const document = opened();
    const current = settings();
    const overrides = visibility();
    return document?.ok ? client.render(document.value.document, current, overrides) : undefined;
  });
}

/** Reads the source and opens it; a source that cannot be read fails like an unreadable file. */
async function readAndOpen(client: PsdClient, source: PsdSource): Promise<PsdResultOf<OpenedPsd>> {
  let bytes: ArrayBuffer;
  try {
    bytes = await source.read();
  } catch (error) {
    return { ok: false, error: { kind: 'invalid', message: `${source.name} could not be read: ${String(error)}` } };
  }

  return client.open(bytes);
}
