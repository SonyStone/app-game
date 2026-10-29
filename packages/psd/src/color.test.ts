import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { writePsd } from './index';
import { openPsd, photoshopDefaultSettings, type PsdResult } from './viewer';

it('separates exact RGB process samples from configured sRGB and preserves the default display', async () => {
  const srgb = await profile('srgb');
  const pixels = Uint8Array.of(23, 117, 201, 255);
  const document = value(await openPsd(await writePsd({ width: 1, height: 1, layers: [] }, pixels)));
  try {
    const before = value(document.render(photoshopDefaultSettings));
    const color = { srgb, workingRgb: srgb };
    const settings = { ...photoshopDefaultSettings, approximate: false as const };
    const exact = value(document.renderColor(settings, color));
    expect(exact).toMatchObject({
      width: 1,
      height: 1,
      mode: 3,
      colorChannels: 3,
      displayWidth: 1,
      displayHeight: 1,
      process: { encoding: 'byte', values: pixels },
      srgb: { encoding: 'byte', values: pixels },
      rgba8: pixels,
      conversion: { exact: true, requestedEngine: 'ace', importPolicy: 'Preserve' },
      approximations: []
    });

    // Dither changes conversion fidelity only, even though both calls composite exact process samples.
    const approximate = value(document.renderColor(settings, { ...color, dither: true, importPolicy: 'convert' }));
    expect(approximate.process).toEqual(exact.process);
    expect(approximate.conversion).toMatchObject({
      exact: false,
      importPolicy: 'Convert',
      approximation: { kind: 'DisplayConversion', dither: true, aceDitherImplemented: false }
    });
    expect(approximate.approximations[0]).toContain('DisplayConversion');
    expect(value(document.render(photoshopDefaultSettings)).pixels).toEqual(before.pixels);
    expect(before.pixels).toEqual(pixels);
    expect(value(document.difference(before)).differingSamples).toBe(0);
  } finally {
    document.close();
  }

  expect(document.renderColor({ ...photoshopDefaultSettings, approximate: false }, { srgb })).toMatchObject({
    ok: false,
    error: { kind: 'invalid', message: 'the document is closed' }
  });
});

it('keeps CMYK process channels and saved planes separate from display-conversion approximations', async () => {
  const srgb = await profile('srgb');
  const workingCmyk = await profile('cmyk');
  const color = { srgb, workingCmyk };
  const document = value(await openPsd(await example('cmyk-levels.psd')));
  const settings = { ...photoshopDefaultSettings, approximate: false as const };
  try {
    const rendered = value(document.renderColor(settings, color));
    expect(rendered).toMatchObject({ mode: 4, colorChannels: 4, process: { encoding: 'byte' } });
    expect(rendered.process.values).toHaveLength(96 * 96 * 5);
    expect(rendered.srgb.values).toHaveLength(96 * 96 * 4);
    expect(rendered.rgba8).toHaveLength(96 * 96 * 4);
    expect(rendered.conversion).toMatchObject({
      exact: true,
      sourceOrigin: 'Some(Working)',
      approximation: null
    });
    expect(rendered.approximations).toEqual([]);

    const unverified = workingCmyk.slice();
    // Creation-time metadata changes profile identity without changing its color transform.
    unverified[35] = unverified[35]! ^ 1;
    const approximate = value(document.renderColor(settings, { srgb, workingCmyk: unverified }));
    expect(approximate.process).toEqual(rendered.process);
    expect(approximate.conversion).toMatchObject({
      exact: false,
      approximation: { kind: 'DisplayConversion' }
    });
    expect(approximate.approximations[0]).toContain('DisplayConversion');

    const saved = value(document.savedProcessChannels());
    expect(saved).toMatchObject({ mode: 4, depth: 8, metadataError: null });
    expect(saved.source).toContain('potentially stale');
    expect(saved.planes.slice(0, 4).map((plane) => plane.role)).toEqual(Array(4).fill('process'));
    expect(saved.planes.every((plane) => plane.visible === null)).toBe(true);
    expect(saved.resources.find((resource) => resource.id === 1039)).toBeUndefined();
    const visibility = saved.planes.map((_, index) => index === 0);
    expect(value(document.savedProcessChannels(visibility)).planes.map((plane) => plane.visible)).toEqual(visibility);
    expect(document.savedProcessChannels([])).toMatchObject({ ok: false, error: { kind: 'invalid' } });

    const hidden = value(document.renderColor(settings, color, [[0, false]]));
    expect(hidden.process).not.toEqual(rendered.process);
    expect(value(document.renderColor(settings, color)).process).toEqual(rendered.process);
  } finally {
    document.close();
  }

  expect(document.savedProcessChannels()).toMatchObject({ ok: false, error: { message: 'the document is closed' } });
});

it('refuses configured conversions with missing profiles or unsupported presentation', async () => {
  const srgb = await profile('srgb');
  const document = value(await openPsd(await writePsd({ width: 1, height: 1, layers: [] }, Uint8Array.of(1, 2, 3, 255))));
  const settings = { ...photoshopDefaultSettings, approximate: false as const };
  try {
    expect(document.renderColor(settings, { srgb })).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
    expect(document.renderColor(settings, { srgb: new Uint8Array(), workingRgb: srgb })).toMatchObject({ ok: false });
    expect(document.renderColor(settings, { srgb, workingRgb: srgb, proof: true })).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' }
    });
  } finally {
    document.close();
  }
});

it.each([16, 32] as const)('preserves %i-bit process precision and native saved bytes', async (depth) => {
  const srgb = await profile('srgb');
  const samples = depth === 16 ? [0, 65535, 65535, 65535] : [0.125, 0.5, 1, 1];
  const bytes = flatRgb(depth, samples);
  const document = value(await openPsd(bytes));
  try {
    const rendered = value(
      document.renderColor({ ...photoshopDefaultSettings, approximate: false }, { srgb, workingRgb: srgb })
    );
    expect(rendered.process.encoding).toBe(depth === 16 ? 'wire16' : 'float32');
    expect(rendered.process.values).toBeInstanceOf(depth === 16 ? Uint16Array : Float32Array);
    expect([...rendered.process.values]).toEqual(samples);
    expect(rendered.srgb.values).toBeInstanceOf(depth === 16 ? Uint16Array : Float32Array);
    expect(rendered.rgba8).toHaveLength(4);

    const saved = value(document.savedProcessChannels());
    expect(saved.depth).toBe(depth);
    expect(saved.planes.map((plane) => plane.role)).toEqual(['process', 'process', 'process', 'auxiliary']);
    expect(Uint8Array.from(saved.planes.flatMap((plane) => [...plane.bytes]))).toEqual(bytes.subarray(40));
  } finally {
    document.close();
  }
});

/** A single-pixel RGB PSD with no layers and four big-endian saved planes. */
function flatRgb(depth: 16 | 32, samples: number[]): Uint8Array {
  const bytes = new Uint8Array(40 + (depth / 8) * samples.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('8BPS'));
  view.setUint16(4, 1);
  view.setUint16(12, 4);
  view.setUint32(14, 1);
  view.setUint32(18, 1);
  view.setUint16(22, depth);
  view.setUint16(24, 3);
  for (const [index, sample] of samples.entries()) {
    if (depth === 16) {
      view.setUint16(40 + index * 2, sample);
    } else {
      view.setFloat32(40 + index * 4, sample);
    }
  }

  return bytes;
}

/** ICC test operands from photoshop-analysis 604bc7be66, psd-rs/src/data; never used as application defaults. */
async function profile(name: 'srgb' | 'cmyk'): Promise<Uint8Array> {
  return readFile(new URL(`../test/${name}.icc`, import.meta.url));
}

async function example(name: string): Promise<Uint8Array> {
  return readFile(new URL(`../../../apps/psd-viewer/src/features/examples/assets/${name}`, import.meta.url));
}

function value<T>(result: PsdResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }

  return result.value;
}
