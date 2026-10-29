import { writePsd, type PsdLayer } from '@app-game/psd';
import { withLayerBlock, withModernTop, withTopBlock } from './patchedPsd';

/** Real PSD arithmetic controls also consumed by the browser GPU fixture test. */
export async function operandControls() {
  const width = 256;
  const height = 16;
  const makeLayer = (index: number): PsdLayer => ({
    name: `operand ${index}`,
    left: 0,
    top: 0,
    width,
    height,
    visible: true,
    opacity: index === 1 ? 173 / 255 : 1,
    fill: index === 1 ? 77 / 255 : 1,
    blend: index === 1 ? 'screen' : 'normal',
    clipping: index > 0,
    transparencyLocked: false,
    pixels: Uint8Array.from({ length: width * height * 4 }, (_, i) => {
      const x = Math.floor(i / 4) % 256;
      return i % 4 === 3
        ? [0, 1, 2, 77, 127, 128, 173, 254, 255][Math.floor(i / 1024) % 9]!
        : (x * [1, 3, 7][i % 4]! + index * 53) % 256;
    })
  });
  const layers = [makeLayer(0), makeLayer(1), makeLayer(2)];
  const clipping = new Uint8Array(withModernTop(await writePsd({ width, height, layers }, layers[0]!.pixels)));
  const base = layers[0]!;
  const top = { ...makeLayer(1), clipping: false, blend: 'multiply' as const };
  const plain = new Uint8Array(withModernTop(await writePsd({ width, height, layers: [base, top] }, base.pixels)));
  const groupLayers = [
    layers[0]!,
    { ...layers[0]!, name: 'group end' },
    { ...layers[1]!, clipping: false },
    { ...layers[2]!, clipping: false },
    { ...layers[0]!, name: 'isolated group', opacity: 173 / 255 }
  ];
  let group = new Uint8Array(withModernTop(await writePsd({ width, height, layers: groupLayers }, layers[0]!.pixels)));
  group = withTopBlock(group, 'lsct', new Uint8Array([0, 0, 0, 1]));
  group = withLayerBlock(group, 'lsct', new Uint8Array([0, 0, 0, 3]), 1);
  const controls = [
    { name: 'isolated-normal', bytes: group },
    { name: 'clipping', bytes: clipping }
  ];
  for (const [key, values] of [
    ['nvrt', []],
    ['post', [0, 7]],
    ['thrs', [0, 128]],
    ['brit', [0, 27, 255, 219]]
  ] as const) {
    controls.push({ name: key, bytes: withTopBlock(plain, key, Uint8Array.from(values)) });
  }
  const solid = new Uint8Array(
    withModernTop(
      await writePsd({ width, height, layers: [base, { ...top, opacity: 1, fill: 1, blend: 'normal' }] }, base.pixels)
    )
  );
  const descriptor: number[] = [];
  const word = (value: number) => descriptor.push(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  const code = (value: string) => descriptor.push(...new TextEncoder().encode(value));
  const id = (value: string) => {
    word(0);
    code(value);
  };
  word(16);
  word(0);
  id('null');
  word(1);
  id('Clr ');
  code('Objc');
  word(0);
  id('RGBC');
  word(3);
  for (const [key, value] of [
    ['Rd  ', 27],
    ['Grn ', 128],
    ['Bl  ', 219]
  ] as const) {
    id(key);
    code('doub');
    const number = new Uint8Array(8);
    new DataView(number.buffer).setFloat64(0, value);
    descriptor.push(...number);
  }
  controls.push({ name: 'strict-solid-fill', bytes: withTopBlock(solid, 'SoCo', Uint8Array.from(descriptor)) });
  const levels = new Uint8Array(2 + 29 * 10);
  const data = new DataView(levels.buffer);
  data.setUint16(0, 2);
  for (let record = 0; record < 29; record++) {
    [record < 4 ? 19 : 0, record < 4 ? 233 : 255, 0, 255, 100].forEach((value, i) =>
      data.setUint16(2 + record * 10 + i * 2, value)
    );
  }
  controls.push({ name: 'levels', bytes: withTopBlock(plain, 'levl', levels) });
  return controls;
}
