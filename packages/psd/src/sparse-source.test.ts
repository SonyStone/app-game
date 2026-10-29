import { closeSync, ftruncateSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openPsdSource } from './viewer';

it('reads a real sparse PSB layer past 4 GiB with bigint spans and bounded host reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'psd-phase5-sparse-'));
  const fd = openSync(join(directory, 'external.psb'), 'wx+');
  const prefix: Buffer[] = [
    Buffer.from('8BPS'),
    u16(2),
    Buffer.alloc(6),
    u16(1),
    u32(1),
    u32(1),
    u16(8),
    u16(1),
    Buffer.alloc(8)
  ];
  const records: Buffer[] = [];
  for (const [length, side] of [
    [2n ** 32n + 2n, 65536],
    [3n, 1]
  ] as const) {
    records.push(
      Buffer.alloc(8),
      u32(side),
      u32(side),
      u16(1),
      u16(0),
      u64(length),
      Buffer.from('8BIMnorm'),
      Buffer.from([255, 0, 0, 0]),
      u32(12),
      Buffer.alloc(12)
    );
  }
  const recordBytes = Buffer.concat(records);
  const layerLength = 2n + BigInt(recordBytes.length) + 2n ** 32n + 2n + 3n;
  prefix.push(u64(8n + layerLength + 4n), u64(layerLength), u16(2), recordBytes);
  const header = Buffer.concat(prefix);
  const second = BigInt(header.length) + 2n ** 32n + 2n;
  const length = second + 7n;
  ftruncateSync(fd, Number(length));
  writeSync(fd, header, 0, header.length, 0);
  writeSync(fd, Uint8Array.of(0, 0, 71), 0, 3, Number(second));
  let largestRead = 0;
  const opened = await openPsdSource((offset, size) => {
    largestRead = Math.max(largestRead, size);
    const bytes = new Uint8Array(size);
    expect(readSync(fd, bytes, 0, size, offset)).toBe(size);
    return bytes;
  }, length);
  try {
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const layers = opened.value.layerInfo();
    expect(layers).toMatchObject({ ok: true, value: [{}, { channels: [{ offset: second }] }] });
    const pixels = opened.value.layerRegion(1, { left: 0, top: 0, width: 1, height: 1 }, Int16Array.of(0));
    expect(pixels).toMatchObject({ ok: true, value: { planes: [{ bytes: Uint8Array.of(71) }] } });
    expect(largestRead).toBeLessThanOrEqual(56);
  } finally {
    if (opened.ok) {
      opened.value.close();
    }
    closeSync(fd);
    rmSync(directory, { recursive: true });
  }
});

function u16(value: number) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}
function u32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}
function u64(value: bigint) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}
