import { deflateSync } from 'node:zlib';

/**
 * Generates a 300,000-square PSB with a ZIP-compressed 128-square red layer at (299008,299008), without a saved
 * composite. The canvas exceeds wasm32 indexing and cannot be allocated whole; the file itself is under 1 KiB.
 */
export function largePsb(): Uint8Array {
  const u16 = (value: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(value & 0xffff);
    return b;
  };
  const u32 = (value: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(value);
    return b;
  };
  const u64 = (value: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(value));
    return b;
  };
  const text = (value: string) => Buffer.from(value, 'ascii');
  const channels = [255, 0, 0, 255].map((value) =>
    Buffer.concat([u16(2), deflateSync(Buffer.alloc(128 * 128, value))])
  );
  const extra = Buffer.concat([u32(0), u32(0), Buffer.from([3, 82, 101, 100])]);
  const record = Buffer.concat([
    u32(299008),
    u32(299008),
    u32(299136),
    u32(299136),
    u16(4),
    ...channels.flatMap((channel, index) => [u16(index === 3 ? -1 : index), u64(channel.length)]),
    text('8BIMnorm'),
    Buffer.from([255, 0, 0, 0]),
    u32(extra.length),
    extra
  ]);
  let layerInfo = Buffer.concat([u16(1), record, ...channels]);
  if (layerInfo.length % 2) {
    layerInfo = Buffer.concat([layerInfo, Buffer.alloc(1)]);
  }

  const layerMask = Buffer.concat([u64(layerInfo.length), layerInfo, u32(0)]);
  return Uint8Array.from(
    Buffer.concat([
      text('8BPS'),
      u16(2),
      Buffer.alloc(6),
      u16(3),
      u32(300000),
      u32(300000),
      u16(8),
      u16(3),
      u32(0),
      u32(0),
      u64(layerMask.length),
      layerMask
    ])
  );
}
