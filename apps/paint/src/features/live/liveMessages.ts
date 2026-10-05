import type { Camera, Point, ViewSize } from '@app-game/paint-core/camera';
import type { LiveState } from '@app-game/paint-core/liveDrawing';

/**
 * What an author sends viewers through the relay:
 * - `drawing`: layers and changed tiles of the author's drawing; see `LiveState`;
 * - `view`: the author's camera and canvas size, which viewers follow;
 * - `pointer`: where the author's pen or mouse is, in document pixels, whether it touches, and the brush diameter;
 *   `point` is `null` when it left the canvas;
 * - `hello`: from the author, asks every viewer to announce itself, as after the author reconnected; from a viewer,
 *   announces it, so that the author sends it the drawing from the start.
 *
 * Viewers send only `hello`.
 *
 * A message is a JSON header and, for `drawing`, the tiles' bytes after it: `[header length, u32][header][bytes]`.
 */
export type LiveMessage =
  | ({ type: 'drawing' } & LiveState)
  | { type: 'view'; camera: Camera; size: ViewSize }
  | { type: 'pointer'; point: Point | null; contact: boolean; size: number }
  | { type: 'hello' };

/** `message` as bytes for the relay. */
export function encodeLiveMessage(message: LiveMessage): Uint8Array {
  const blobs: Uint8Array[] = [];
  const header =
    message.type === 'drawing'
      ? {
          ...message,
          tiles: message.tiles.map(({ layerId, key, bytes }) => {
            if (bytes) {
              blobs.push(bytes);
            }

            return { layerId, key, length: bytes ? bytes.byteLength : -1 };
          })
        }
      : message;
  const json = new TextEncoder().encode(JSON.stringify(header));
  const total = 4 + json.byteLength + blobs.reduce((sum, blob) => sum + blob.byteLength, 0);
  const bytes = new Uint8Array(total);
  new DataView(bytes.buffer).setUint32(0, json.byteLength, true);
  bytes.set(json, 4);
  let offset = 4 + json.byteLength;
  for (const blob of blobs) {
    bytes.set(blob, offset);
    offset += blob.byteLength;
  }

  return bytes;
}

/** The message `encodeLiveMessage` made; throws for malformed bytes. */
export function decodeLiveMessage(bytes: Uint8Array): LiveMessage {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as
    | Exclude<LiveMessage, { type: 'drawing' }>
    | (Omit<Extract<LiveMessage, { type: 'drawing' }>, 'tiles'> & {
        tiles: { layerId: string; key: string; length: number }[];
      });
  if (header.type !== 'drawing') {
    return header;
  }

  let offset = 4 + length;
  return {
    ...header,
    tiles: header.tiles.map(({ layerId, key, length: size }) => {
      if (size < 0) {
        return { layerId, key, bytes: null };
      }

      const tile = bytes.slice(offset, offset + size);
      offset += size;
      if (tile.byteLength !== size) {
        throw new Error('A live message ended inside a tile.');
      }

      return { layerId, key, bytes: tile };
    })
  };
}
