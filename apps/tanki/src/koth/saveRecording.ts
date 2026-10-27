import type { Recording } from './recording';
import { formatRecording, recordingFileName } from './recordingFile';

/** Where a saved recording went: to the dev server's `recordings` folder, as a downloaded file, or nowhere. */
export type SaveResult = { kind: 'saved'; path: string } | { kind: 'downloaded'; name: string } | { kind: 'failed' };

/** A save under way, or how it ended, as the menus tell it. */
export type SaveState = { kind: 'saving' } | SaveResult;

/**
 * Saves `recording`. On the dev server it goes to `apps/tanki/recordings` in the repository,
 * through the dev server's bridge (see `recordingBridge.ts`), which also notes the game code it
 * was played by. A deployed game, or a dev server without the bridge, offers it as a download.
 */
export async function saveRecording(recording: Recording): Promise<SaveResult> {
  const name = recordingFileName(recording);
  const text = formatRecording(recording);

  if (import.meta.env.DEV) {
    try {
      const response = await fetch(`${BRIDGE}/${name}`, { method: 'PUT', body: text, headers: { 'content-type': 'application/json' } });

      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const { path } = (await response.json()) as { path: string };
        return { kind: 'saved', path };
      }
    } catch {
      // No bridge: the download below still keeps the recording.
    }
  }

  try {
    download(name, text);
    return { kind: 'downloaded', name };
  } catch {
    return { kind: 'failed' };
  }
}

/** The dev server's address for saving recordings. */
export const BRIDGE = '/__tanki/recordings';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
