// Damaged copies of the bundled examples, made at test time, for opening files as Photoshop does.

/**
 * A copy of the PSD `bytes` whose channel stream `channel` of layer record `record` (bottom to top, both counted from 0)
 * starts with compression code `code`. Code 4, which no format defines, makes Photoshop ask "This file contains one or
 * more layers which appear to be corrupt. Continue reading layers?"; the strict reader keeps the stream as it is.
 */
export function withChannelCompression(bytes: ArrayBuffer, record: number, channel: number, code = 4): ArrayBuffer {
  const damaged = new Uint8Array(bytes.slice(0));
  const at = channelStreams(damaged)[record]?.[channel];
  if (at === undefined) {
    throw new RangeError(`no channel ${channel} of layer record ${record}`);
  }

  new DataView(damaged.buffer).setUint16(at, code);
  return damaged.buffer;
}

/** A copy of the first `length` bytes of `bytes`: a file cut short, which Photoshop and the strict reader refuse. */
export function truncated(bytes: ArrayBuffer, length: number): ArrayBuffer {
  return bytes.slice(0, length);
}

/**
 * The offsets of each layer record's channel streams in a PSD (not PSB), bottom to top: where each stream's compression
 * code starts. Follows the section lengths from the header to the layer records, then each record's channel lengths.
 */
function channelStreams(bytes: Uint8Array): number[][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 26;
  at += 4 + view.getUint32(at);
  at += 4 + view.getUint32(at);
  // The layer and mask section's length, then the layer-info block's.
  at += 8;
  const count = Math.abs(view.getInt16(at));
  at += 2;
  const lengths: number[][] = [];
  for (let record = 0; record < count; record++) {
    // Rectangle (16 bytes), channel count, 6 bytes per channel, blend signature, key, opacity, clipping, flags, filler.
    const channels = view.getUint16(at + 16);
    lengths.push(Array.from({ length: channels }, (_, channel) => view.getUint32(at + 18 + channel * 6 + 2)));
    at += 18 + channels * 6 + 12;
    at += 4 + view.getUint32(at);
  }

  return lengths.map((streams) =>
    streams.map((length) => {
      const start = at;
      at += length;
      return start;
    })
  );
}
