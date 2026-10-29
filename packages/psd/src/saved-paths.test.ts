import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openPsd } from './viewer';

it('converts signed Q24 Y/X knots to fractional document pixels without rounding or edge clipping', async () => {
  const original = await readFile(
    new URL('../../../apps/psd-viewer/src/features/examples/assets/layer-comps.psd', import.meta.url)
  );
  const width = original.readUInt32BE(18);
  const height = original.readUInt32BE(14);
  const anchors = [
    [-0.125, 0.25],
    [1, 0],
    [1, 1],
    [0.5, 0.75]
  ];
  const records = Buffer.alloc(26 * 7);
  records.writeUInt16BE(6, 0);
  records.writeUInt16BE(0, 26);
  records.writeUInt16BE(4, 28);
  anchors.forEach(([x, y], index) => {
    const offset = (index + 2) * 26;
    records.writeUInt16BE(1, offset);
    for (let handle = 0; handle < 3; handle++) {
      records.writeInt32BE(y! * 2 ** 24, offset + 2 + handle * 8);
      records.writeInt32BE(x! * 2 ** 24, offset + 6 + handle * 8);
    }
  });
  records.writeUInt16BE(8, 26 * 6);
  const resource = Buffer.alloc(12 + records.length);
  resource.write('8BIM');
  resource.writeUInt16BE(2000, 4);
  resource.writeUInt32BE(records.length, 8);
  records.copy(resource, 12);
  const resourcesOffset = 30 + original.readUInt32BE(26);
  const resourcesSize = original.readUInt32BE(resourcesOffset);
  const end = resourcesOffset + 4 + resourcesSize;
  const bytes = Buffer.concat([original.subarray(0, end), resource, original.subarray(end)]);
  bytes.writeUInt32BE(resourcesSize + resource.length, resourcesOffset);
  const opened = await openPsd(bytes);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  try {
    const result = opened.value.savedPaths();
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const path = result.value.find((path) => path.resourceId === 2000);
    expect(path?.outcome).toBe('geometry');
    if (path?.outcome !== 'geometry') {
      throw new Error('Missing path geometry');
    }

    const knots = path.components[0]!.subpaths[0]!.knots;
    expect(knots.map((knot) => knot.anchor)).toEqual(anchors.map(([x, y]) => [x! * width, y! * height]));
    expect(
      knots.every(
        (knot) =>
          JSON.stringify(knot.before) === JSON.stringify(knot.anchor) &&
          JSON.stringify(knot.after) === JSON.stringify(knot.anchor)
      )
    ).toBe(true);
  } finally {
    opened.value.close();
  }
});
