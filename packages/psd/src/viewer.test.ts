import { expect, it } from 'vitest';
import { writePsd, type PsdLayer } from './index';
import { createFontLibrary, openPsd, photoshopDefaultSettings, type PsdResult, type PsdViewerDocument } from './viewer';

/** A layer of one straight RGBA color filling `width` × `height`. */
function solid(name: string, color: number[], patch: Partial<PsdLayer> = {}): PsdLayer {
  const width = patch.width ?? 4;
  const height = patch.height ?? 3;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels.set(color, index);
  }

  return {
    name,
    left: 0,
    top: 0,
    width,
    height,
    pixels,
    opacity: 1,
    visible: true,
    blend: 'normal',
    clipping: false,
    transparencyLocked: false,
    ...patch
  };
}

/** Paper red below a blue Multiply layer at half opacity and a hidden green layer, with `composite` saved as merged. */
async function document(composite: Uint8Array = new Uint8Array(4 * 3 * 4).fill(255)): Promise<PsdViewerDocument> {
  const layers = [
    solid('Paper', [255, 0, 0, 255]),
    solid('Ink', [0, 0, 255, 255], { blend: 'multiply', opacity: 0.5, left: 2, width: 2 }),
    solid('Hidden', [0, 255, 0, 255], { visible: false })
  ];
  return value(await openPsd(await writePsd({ width: 4, height: 3, layers }, composite)));
}

function value<T>(result: PsdResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }

  return result.value;
}

/** The RGBA of pixel (`x`, `y`) of a 4-pixel-wide image. */
function pixel(pixels: Uint8Array, x: number, y: number) {
  return [...pixels.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
}

it('reports the document and its layers bottom to top', async () => {
  const opened = await document();
  expect(opened.info).toMatchObject({ width: 4, height: 3, depth: 8, modeName: 'RGB', psb: false, layerRecords: 3 });
  expect(opened.info.mergedImage).not.toBeNull();
  expect(
    opened.layers.map(({ index, name, kind, blendMode, visible }) => [index, name, kind, blendMode, visible])
  ).toEqual([
    [0, 'Paper', 'pixel', 'normal', true],
    [1, 'Ink', 'pixel', 'multiply', true],
    [2, 'Hidden', 'pixel', 'normal', false]
  ]);
  expect(opened.layers[1]!.keys).toContain('luni');
  opened.close();
});

it('renders with visibility overrides that last for one render', async () => {
  const opened = await document();
  const plain = value(opened.render(photoshopDefaultSettings));
  expect([plain.width, plain.height, plain.depth]).toEqual([4, 3, 8]);
  expect(plain.approximations).toEqual([]);
  // Allowing approximations changes nothing for a document the exact path renders.
  const allowed = value(opened.render({ ...photoshopDefaultSettings, approximate: true }));
  expect(allowed.approximations).toEqual([]);
  expect(allowed.pixels).toEqual(plain.pixels);
  expect(pixel(plain.pixels, 0, 0)).toEqual([255, 0, 0, 255]);
  // Multiply by blue keeps no red; opacity 0.5 is stored as 128 of 255 and leaves 127 of it.
  expect(pixel(plain.pixels, 3, 0)).toEqual([127, 0, 0, 255]);

  const toggled = value(
    opened.render(photoshopDefaultSettings, [
      [1, false],
      [2, true]
    ])
  );
  expect(pixel(toggled.pixels, 3, 0)).toEqual([0, 255, 0, 255]);
  expect(value(opened.render(photoshopDefaultSettings)).pixels).toEqual(plain.pixels);
  opened.close();
});

it('compares a render with the merged image and finds it exact when they agree', async () => {
  const first = await document();
  const render = value(first.render(photoshopDefaultSettings));
  const mismatch = value(first.difference(render));
  // The saved composite is white, with an alpha plane: green and blue differ everywhere.
  expect(mismatch).toMatchObject({
    unit: 'level',
    samples: 4 * 3 * 4,
    differingPixels: 12,
    max: 255,
    alphaDiffering: 0
  });
  expect(mismatch.pixels).toHaveLength(4 * 3 * 4);
  const pixels = render.pixels;
  first.close();

  const exact = await document(pixels);
  expect(value(exact.merged()).pixels).toEqual(pixels);
  const again = value(exact.render(photoshopDefaultSettings));
  expect(value(exact.difference(again))).toMatchObject({
    differingSamples: 0,
    differingPixels: 0,
    max: 0,
    histogram: []
  });
  again.dispose();
  expect(exact.difference(again)).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  exact.close();
  expect(exact.render(photoshopDefaultSettings)).toMatchObject({
    ok: false,
    error: { message: 'the document is closed' }
  });
});

it('reads one layer in detail and its own pixels', async () => {
  const opened = await document();
  const detail = value(opened.layerDetail(1));
  expect(detail).toMatchObject({ index: 1, name: 'Ink', kind: 'pixel', effects: null, adjustment: null, text: null });
  expect(detail.properties).toMatchObject({ blendMode: 'multiply', blendKey: 'mul ', opacity: 128, clipped: false });
  const pixels = value(opened.layerPixels(1));
  expect(pixels).toMatchObject({ left: 2, top: 0, width: 2, height: 3, masks: [] });
  expect([...pixels.pixels.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
  expect(opened.layerDetail(9)).toMatchObject({ ok: false, error: { kind: 'invalid', message: 'no layer record 9' } });
  opened.close();
});

it('renders CMYK and Lab in their own channels and compares them channel by channel', async () => {
  const cmyk = value(await openPsd(flatDocument(4, 4, [255, 128, 0, 200])));
  expect(cmyk.info.notes[0]).toContain('composite in their own channels');
  const render = value(cmyk.render(photoshopDefaultSettings));
  expect(render.depth).toBe(8);
  // Only the display conversion to sRGB is approximate; the merged image is shown through the same conversion.
  expect(render.approximations).toHaveLength(1);
  expect(render.approximations[0]).toMatch(/^8-bit CMYK: composited exactly in its CMYK channels; only the display/);
  expect(render.pixels).toEqual(value(cmyk.merged()).pixels);
  expect(value(cmyk.difference(render))).toMatchObject({ unit: 'CMYK level', samples: 4, differingSamples: 0 });
  // Allowing approximations changes nothing for documents the channel compositor renders.
  expect(value(cmyk.render({ ...photoshopDefaultSettings, approximate: true })).pixels).toEqual(render.pixels);
  cmyk.close();

  const lab = value(await openPsd(flatDocument(9, 3, [200, 100, 160])));
  const labRender = value(lab.render(photoshopDefaultSettings));
  expect(labRender.approximations[0]).toMatch(/^8-bit Lab: composited exactly in its Lab channels/);
  expect(value(lab.difference(labRender))).toMatchObject({ unit: 'Lab level', samples: 3, differingSamples: 0 });
  lab.close();
});

it("refuses Dissolve without Photoshop's noise table and approximates it on request", async () => {
  const layers = [
    solid('Paper', [255, 255, 255, 255]),
    solid('Grain', [200, 30, 10, 255], { blend: 'dissolve', opacity: 0.5 })
  ];
  const opened = value(await openPsd(await writePsd({ width: 4, height: 3, layers }, new Uint8Array(48).fill(255))));
  const setting = "Dissolve without Photoshop's Dissolve noise table";
  expect(opened.render(photoshopDefaultSettings)).toEqual({
    ok: false,
    error: { kind: 'unsupported', message: `layer "Grain": ${setting}` }
  });
  expect(opened.layers[1]!.notes[0]).toMatch(
    /^Dissolve needs Photoshop's noise table.*the approximate render dissolves/
  );

  const approximate = value(opened.render({ ...photoshopDefaultSettings, approximate: true }));
  expect(approximate.approximations).toEqual([
    `\u201cGrain\u201d: ${setting} \u2014 dissolved with a stand-in noise, so other pixels are drawn than in Photoshop`
  ]);
  // Dissolve draws whole pixels: each is paper or grain.
  for (let index = 0; index < 12; index++) {
    expect([
      [255, 255, 255, 255],
      [200, 30, 10, 255]
    ]).toContainEqual(pixel(approximate.pixels, index % 4, index >> 2));
  }

  opened.close();
});

it('names what it cannot read or render', async () => {
  expect(await openPsd(new Uint8Array(40))).toEqual({
    ok: false,
    error: { kind: 'invalid', message: 'not a Photoshop document' }
  });

  // A CMYK header whose flattened image holds no samples.
  const empty = value(await openPsd(flatDocument(4, 4, [])));
  expect(empty.render(photoshopDefaultSettings)).toEqual({
    ok: false,
    error: { kind: 'invalid', message: 'raw channel holds 0 of 4 bytes' }
  });
  expect(empty.merged()).toMatchObject({ ok: false });
  empty.close();

  const multichannel = value(await openPsd(flatDocument(7, 1, [100])));
  expect(multichannel.info.modeName).toBe('Multichannel');
  expect(multichannel.info.notes[0]).toContain('only with Approximate');
  const render = multichannel.render(photoshopDefaultSettings);
  expect(render).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  expect(!render.ok && render.error.message).toContain('mode 7');
  const approximate = value(multichannel.render({ ...photoshopDefaultSettings, approximate: true }));
  expect(approximate.approximations[0]).toMatch(/^8-bit Multichannel: layers converted to 8-bit sRGB/);
  expect(value(multichannel.difference(approximate)).unit).toBe('sRGB level');

  const settings = { ...photoshopDefaultSettings, smartObjects: 'bogus' } as unknown as typeof photoshopDefaultSettings;
  expect(multichannel.render(settings)).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  multichannel.close();
});

/**
 * A 1 × 1 8-bit document of color `mode` with `channels` channels and no layers: a header, three empty sections and
 * a raw flattened image holding `samples`, one byte per channel.
 */
function flatDocument(mode: number, channels: number, samples: number[]): Uint8Array {
  return Uint8Array.from([
    ...[56, 66, 80, 83],
    ...u16(1),
    ...Array<number>(6).fill(0),
    ...u16(channels),
    ...u32(1),
    ...u32(1),
    ...u16(8),
    ...u16(mode),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u16(0),
    ...samples
  ]);
}

/** A big-endian 16-bit field. */
function u16(value: number) {
  return [value >> 8, value & 255];
}

/** A big-endian 32-bit field. */
function u32(value: number) {
  return [value >>> 24, (value >> 16) & 255, (value >> 8) & 255, value & 255];
}

it('adds fonts by PostScript name and rejects what it cannot read with a clear reason', async () => {
  const library = await createFontLibrary();
  expect(library.fonts()).toEqual([]);
  expect(library.add(new Uint8Array(64))).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  const collection = new Uint8Array(64);
  collection.set(new TextEncoder().encode('ttcf'));
  expect(library.add(collection)).toEqual({
    ok: false,
    error: {
      kind: 'unsupported',
      message: 'a font collection (.ttc or .otc): supply each font of the collection as its own .ttf or .otf file'
    }
  });
  expect(library.setHyphenationDictionary(new Uint8Array(8))).toMatchObject({
    ok: false,
    error: { kind: 'unsupported' }
  });
  library.free();
  expect(library.add(new Uint8Array(64))).toMatchObject({
    ok: false,
    error: { message: 'the font library was freed' }
  });
});

it('reports no fonts or text support for a document without type layers, and renders it with typeLayers', async () => {
  const opened = await document();
  expect(value(opened.fonts())).toEqual({ fonts: [], layers: [] });
  expect(value(opened.textSupport(0))).toBeNull();
  const render = value(opened.render({ ...photoshopDefaultSettings, typeLayers: true }));
  expect(render.approximations).toEqual([]);
  opened.close();
});
