import { RECORDING_FORMAT, type Recording } from './recording';
import { BRIDGE } from './saveRecording';

/** A recording saved on the dev server, as `listRecordings` tells of it. */
export type SavedRecording = { name: string; size: number; savedAt: string };

/** What opening a recording came to: the recording, or why it could not be read. */
export type OpenResult = { kind: 'opened'; recording: Recording; name: string } | { kind: 'failed'; reason: string };

/**
 * The recordings saved in the dev server's `recordings` folder, newest first (see
 * `recordingBridge.ts`); none in a deployed game or without the bridge.
 */
export async function listRecordings(): Promise<SavedRecording[]> {
  if (!import.meta.env.DEV) {
    return [];
  }

  try {
    const response = await fetch(`${BRIDGE}/`);
    return response.ok && response.headers.get('content-type')?.includes('application/json') ? ((await response.json()) as SavedRecording[]) : [];
  } catch {
    return [];
  }
}

/** Opens the recording named `name` in the dev server's `recordings` folder. */
export async function loadRecording(name: string): Promise<OpenResult> {
  try {
    const response = await fetch(`${BRIDGE}/${encodeURIComponent(name)}`);
    return response.ok ? parseRecording(await response.text(), name) : { kind: 'failed', reason: `${response.status} ${await response.text()}` };
  } catch (error) {
    return { kind: 'failed', reason: String(error) };
  }
}

/** Opens a recording from a file the player picked or dropped. */
export async function readRecordingFile(file: File): Promise<OpenResult> {
  try {
    return parseRecording(await file.text(), file.name);
  } catch (error) {
    return { kind: 'failed', reason: String(error) };
  }
}

/** The recording in `text`, if it is one of a format this game reads. */
function parseRecording(text: string, name: string): OpenResult {
  try {
    const recording = JSON.parse(text) as Partial<Recording>;

    if (recording.game !== 'tanki-koth' || !recording.chronicle || !recording.setup) {
      return { kind: 'failed', reason: `${name} is not a Tanki recording` };
    }

    if (recording.format !== RECORDING_FORMAT) {
      return { kind: 'failed', reason: `${name} is of format ${recording.format}; this game reads ${RECORDING_FORMAT}` };
    }

    return { kind: 'opened', recording: recording as Recording, name };
  } catch (error) {
    return { kind: 'failed', reason: `${name}: ${String(error)}` };
  }
}
