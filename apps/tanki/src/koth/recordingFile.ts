/**
 * A recording as the text of its file: JSON with every top-level field, and every field of the
 * chronicle, on its own line, and the rows of their lists, as input rows, events, samples and
 * kills, one to a line, so a person or a tool finds a moment with `grep` and reads it whole.
 * `JSON.parse` reads it back.
 */
export function formatRecording(recording: object) {
  return `${format(recording, 0)}\n`;
}

/**
 * The file name a recording is saved under: when it was saved, in local time, the player's class
 * and the seed, as `2026-10-27_14-05-31_soldier_seed123.tanki-replay.json`.
 */
export function recordingFileName(recording: { recordedAt: string; setup: { seed: number; playerClass: string } }) {
  const at = new Date(recording.recordedAt);
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}_${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`;
  return `${date}_${recording.setup.playerClass}_seed${recording.setup.seed}${RECORDING_EXTENSION}`;
}

/** The ending of a recording's file name. */
export const RECORDING_EXTENSION = '.tanki-replay.json';

/** `value` as JSON, objects down to `depth` 1 and lists down to `depth` 2 broken into lines. */
function format(value: unknown, depth: number): string {
  if (Array.isArray(value) && depth <= 2 && value.length > 0) {
    return `[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]`;
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && depth <= 1) {
    const entries = Object.entries(value).filter(([, field]) => field !== undefined);
    return `{\n${entries.map(([key, field]) => `${JSON.stringify(key)}: ${format(field, depth + 1)}`).join(',\n')}\n}`;
  }

  return JSON.stringify(value);
}
