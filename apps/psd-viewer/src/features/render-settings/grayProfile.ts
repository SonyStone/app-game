/** Builds an original ICC v2 Gray profile from the Dot Gain 20% formula used by psd-rs.
 * The 256-sample curve uses gamma ln(0.3)/ln(0.5), with a 1/16 linear toe.
 * D50 white, zero black and relative colorimetric intent match the measured working space.
 */
export function createGrayProfile(): Uint8Array {
  const text = (value: string) => new TextEncoder().encode(value);
  const xyz = (values: number[]) => {
    const bytes = new Uint8Array(20);
    bytes.set(text('XYZ '));
    values.forEach((value, index) => new DataView(bytes.buffer).setInt32(8 + index * 4, value));
    return bytes;
  };
  const curve = new Uint8Array(524);
  const view = new DataView(curve.buffer);
  curve.set(text('curv'));
  view.setUint32(8, 256);
  for (let index = 0; index < 256; index++) {
    const x = index / 255;
    view.setUint16(
      12 + index * 2,
      Math.max(Math.round(65535 * x ** (Math.log(0.3) / Math.log(0.5))), Math.round((65535 * x) / 16))
    );
  }

  const name = text('Formula gray, 20 percent gain\0');
  const description = new Uint8Array(12 + name.length + 78);
  description.set(text('desc'));
  new DataView(description.buffer).setUint32(8, name.length);
  description.set(name, 12);
  const copyright = text('text\0\0\0\0Generated from a mathematical tone curve.\0');
  const white = [63190, 65536, 54061];
  const tags = [
    ['desc', description],
    ['cprt', copyright],
    ['wtpt', xyz(white)],
    ['bkpt', xyz([0, 0, 0])],
    ['kTRC', curve]
  ] as const;
  const start = 132 + tags.length * 12;
  const size = start + tags.reduce((sum, [, data]) => sum + Math.ceil(data.length / 4) * 4, 0);
  const bytes = new Uint8Array(size);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, size);
  header.setUint32(8, 0x02100000);
  bytes.set(text('mntrGRAYXYZ '), 12);
  [2026, 10, 17].forEach((value, index) => header.setUint16(24 + index * 2, value));
  bytes.set(text('acsp'), 36);
  header.setUint32(64, 1);
  bytes.set(xyz(white).subarray(8), 68);
  header.setUint32(128, tags.length);
  let offset = start;
  tags.forEach(([signature, data], index) => {
    const entry = 132 + index * 12;
    bytes.set(text(signature), entry);
    header.setUint32(entry + 4, offset);
    header.setUint32(entry + 8, data.length);
    bytes.set(data, offset);
    offset += Math.ceil(data.length / 4) * 4;
  });
  return bytes;
}
