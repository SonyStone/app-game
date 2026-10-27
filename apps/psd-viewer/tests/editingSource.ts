import { writePsd } from '@app-game/psd';

/** Real flat source with one existing resolution resource; no imported semantic document is flattened. */
export async function createEditingSource() {
  const pixels = Uint8Array.of(20, 40, 60, 255);
  const bytes = await writePsd(
    {
      width: 1,
      height: 1,
      layers: [
        {
          name: 'raster',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          pixels,
          opacity: 1,
          visible: true,
          blend: 'normal',
          clipping: false,
          transparencyLocked: false
        }
      ]
    },
    pixels
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = 26 + 4 + view.getUint32(26);
  const resource = Uint8Array.of(
    56,
    66,
    73,
    77,
    3,
    237,
    0,
    0,
    0,
    0,
    0,
    16,
    0,
    72,
    0,
    0,
    0,
    1,
    0,
    1,
    0,
    72,
    0,
    0,
    0,
    1,
    0,
    1
  );
  const output = new Uint8Array(bytes.length + resource.length);
  output.set(bytes.subarray(0, at + 4 + view.getUint32(at)));
  output.set(resource, at + 4 + view.getUint32(at));
  output.set(bytes.subarray(at + 4 + view.getUint32(at)), at + 4 + view.getUint32(at) + resource.length);
  new DataView(output.buffer).setUint32(at, view.getUint32(at) + resource.length);
  return output;
}
