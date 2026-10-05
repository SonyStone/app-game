/**
 * The relay's wire format. Application data, such as an author's strokes and tiles, travels in binary frames that the
 * relay forwards without reading; only a short address goes in front. The relay's own notices are JSON text frames.
 *
 * - Author to relay: `[0][payload]` goes to every viewer, `[1][n][peer, n bytes][payload]` to one.
 * - Viewer to relay: `[payload]`, which goes to the author.
 * - Relay to author: `[n][peer, n bytes][payload]`, the viewer the payload came from.
 * - Relay to viewer: `[payload]`, as the author sent it.
 */

/** Whether a connection draws (`author`, one per room) or watches (`viewer`). */
export type Role = 'author' | 'viewer';

/** Where an author's frame goes: to every viewer, or to one viewer by its peer id. */
export type Target = { kind: 'viewers' } | { kind: 'peer'; peer: string };

/** An author's frame for `target`. */
export function addressFrame(target: Target, payload: Uint8Array): Uint8Array {
  if (target.kind === 'viewers') {
    const frame = new Uint8Array(1 + payload.byteLength);
    frame[0] = 0;
    frame.set(payload, 1);
    return frame;
  }

  const peer = encodePeer(target.peer);
  const frame = new Uint8Array(2 + peer.byteLength + payload.byteLength);
  frame[0] = 1;
  frame[1] = peer.byteLength;
  frame.set(peer, 2);
  frame.set(payload, 2 + peer.byteLength);
  return frame;
}

/** The target and payload of an author's frame; throws for a malformed one. */
export function readAddressed(frame: Uint8Array): { target: Target; payload: Uint8Array } {
  if (frame[0] === 0) {
    return { target: { kind: 'viewers' }, payload: frame.subarray(1) };
  }

  if (frame[0] === 1 && frame.byteLength >= 2 && frame.byteLength >= 2 + frame[1]!) {
    const length = frame[1]!;
    return {
      target: { kind: 'peer', peer: decoder.decode(frame.subarray(2, 2 + length)) },
      payload: frame.subarray(2 + length)
    };
  }

  throw new Error('A malformed frame from the author.');
}

/** A viewer's payload as the author receives it, with the viewer's peer id in front. */
export function fromPeer(peer: string, payload: Uint8Array): Uint8Array {
  const id = encodePeer(peer);
  const frame = new Uint8Array(1 + id.byteLength + payload.byteLength);
  frame[0] = id.byteLength;
  frame.set(id, 1);
  frame.set(payload, 1 + id.byteLength);
  return frame;
}

/** The viewer and payload of a frame the author received; throws for a malformed one. */
export function readFromPeer(frame: Uint8Array): { peer: string; payload: Uint8Array } {
  const length = frame[0];
  if (length === undefined || frame.byteLength < 1 + length) {
    throw new Error('A malformed frame from a viewer.');
  }

  return { peer: decoder.decode(frame.subarray(1, 1 + length)), payload: frame.subarray(1 + length) };
}

/**
 * What the relay tells a connection, as a JSON text frame:
 * - `welcome`: the connection was admitted, as `peer`, with `viewers` watching and whether the author is there;
 * - `viewers`: how many watch now;
 * - `joined` and `left` (to the author): a viewer came or went, so the author can send a new one the drawing;
 * - `author` (to viewers): the author connected or disconnected;
 * - `refused`: the connection was not admitted, for `reason`; the relay closes it.
 */
export type RelayNotice =
  | { type: 'welcome'; peer: string; role: Role; viewers: number; author: boolean }
  | { type: 'viewers'; count: number }
  | { type: 'joined'; peer: string }
  | { type: 'left'; peer: string }
  | { type: 'author'; present: boolean }
  | { type: 'refused'; reason: string };

/** Room ids: lower-case letters and digits, 6 to 32 of them. */
export const roomPattern = /^[a-z0-9]{6,32}$/;

function encodePeer(peer: string) {
  const bytes = encoder.encode(peer);
  if (bytes.byteLength > 255) {
    throw new Error('A peer id is longer than 255 bytes.');
  }

  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
