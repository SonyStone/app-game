import { photoshopDefaultSettings, type PsdInterpolation, type PsdRenderSettings } from '@app-game/psd/viewer';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { makePsdClient, type PsdResultOf, type PsdWorkerPort } from '../src/features/psd-worker';
import type { PsdReply, PsdRequest } from '../src/features/psd-worker/protocol';
import { makePsdWorkerHost } from '../src/features/psd-worker/workerHost';

/** A client wired to a host in this thread, as the worker would be; messages are cloned like `postMessage` does. */
function connect() {
  const sent: PsdRequest[] = [];
  const transferred: Transferable[][] = [];
  const port: PsdWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage(message, transfer) {
      sent.push(message);
      transferred.push(transfer);
      void host.receive(structuredClone(message));
    }
  };
  const host = makePsdWorkerHost((reply: PsdReply) => queueMicrotask(() => port.onmessage?.({ data: reply })));
  return { client: makePsdClient(port), port, sent, transferred };
}

async function example(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`../src/features/examples/assets/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function value<T>(result: PsdResultOf<T> | undefined): T {
  if (!result?.ok) {
    throw new Error(result ? `${result.error.kind}: ${result.error.message}` : 'no result');
  }

  return result.value;
}

const settings: PsdRenderSettings = photoshopDefaultSettings;

/** Photoshop's "Image Interpolation" preferences. */
const interpolations: PsdInterpolation[] = [
  'nearestNeighbor',
  'bilinear',
  'bicubic',
  'bicubicSmoother',
  'bicubicSharper',
  'bicubicAutomatic'
];

/**
 * A copy of `bytes` whose last Normal layer record, the topmost, takes the blend-mode key `key`, a four-character
 * code such as `mul `.
 */
function withTopBlendKey(bytes: ArrayBuffer, key: string): ArrayBuffer {
  const patched = new Uint8Array(bytes.slice(0));
  // windows-1252 decodes every byte to one character, so string indices are byte offsets.
  const at = new TextDecoder('latin1').decode(patched).lastIndexOf('8BIMnorm');
  patched.set(new TextEncoder().encode(key), at + 4);
  return patched.buffer;
}

it('opens, renders and compares an example our renderer reproduces exactly', async () => {
  const { client } = connect();
  const opened = value(await client.open(await example('adjustment-stack.psd')));
  expect(opened.info).toMatchObject({ width: 96, height: 96, depth: 8, modeName: 'RGB' });
  expect(opened.layers.map((layer) => [layer.name, layer.kind, layer.adjustment])).toEqual([
    ['Background', 'pixel', undefined],
    ['levels', 'adjustment', 'Levels'],
    ['curves', 'adjustment', 'Curves'],
    ['hue/sat', 'adjustment', 'Hue/Saturation'],
    ['posterize', 'adjustment', 'Posterize']
  ]);

  const render = value(await client.render(opened.document, settings, []));
  expect(render).toMatchObject({ width: 96, height: 96, depth: 8, approximations: [] });
  expect(render.pixels).toHaveLength(96 * 96 * 4);
  expect(value(await client.difference(opened.document, render.render))).toMatchObject({
    differingSamples: 0,
    max: 0,
    samples: 96 * 96 * 3
  });

  const hidden = value(await client.render(opened.document, settings, [[4, false]]));
  const mismatch = value(await client.difference(opened.document, hidden.render));
  expect(mismatch.differingSamples).toBeGreaterThan(0);
  expect(mismatch.max).toBe(42);
  // The render before stays comparable while one newer render exists; older ones are freed.
  expect(value(await client.difference(opened.document, render.render)).differingSamples).toBe(0);
  value(await client.render(opened.document, settings, []));
  expect(await client.difference(opened.document, render.render)).toMatchObject({
    ok: false,
    error: { kind: 'stale' }
  });

  const merged = value(await client.merged(opened.document));
  expect(merged.pixels).toEqual(render.pixels);
});

it('coalesces renders: only the newest waiting render runs after the one in flight', async () => {
  const { client, sent } = connect();
  const { document } = value(await client.open(await example('pass-through-groups.psd')));
  const first = client.render(document, settings, []);
  const second = client.render(document, settings, [[3, false]]);
  const third = client.render(document, { ...settings, linearBlending: true }, []);
  expect(await second).toEqual({
    ok: false,
    error: { kind: 'superseded', message: 'a newer render replaced this one' }
  });
  expect((await first).ok).toBe(true);
  const last = value(await third);
  expect(sent.filter((request) => request.type === 'render')).toHaveLength(2);
  // Captured with gamma 1.0 blending, which the third render used.
  expect(value(await client.difference(document, last.render)).differingSamples).toBe(0);
});

it('reports unreadable files, unsupported settings and approximations as typed failures', async () => {
  const { client } = connect();
  expect(await client.open(new Uint8Array(64).buffer)).toEqual({
    ok: false,
    error: { kind: 'invalid', message: 'not a Photoshop document' }
  });

  // Photoshop offers blend modes on adjustment layers; the CMYK channel compositor does not reproduce them.
  const multiply = value(await client.open(withTopBlendKey(await example('cmyk-levels.psd'), 'mul ')));
  expect(multiply.layers[1]).toMatchObject({ name: 'levels', kind: 'adjustment', blendMode: 'multiply' });
  expect(await client.render(multiply.document, settings, [])).toEqual({
    ok: false,
    error: { kind: 'unsupported', message: 'adjustment layers with a blend mode, Fill or effects in 8-bit CMYK' }
  });
  const approximate = value(await client.render(multiply.document, { ...settings, approximate: true }, []));
  expect(approximate.approximations).toHaveLength(1);
  expect(approximate.approximations[0]).toMatch(/^8-bit CMYK: layers converted to 8-bit sRGB/);
  expect(value(await client.difference(multiply.document, approximate.render)).unit).toBe('sRGB level');

  // Requests about a document the worker no longer holds are refused.
  value(await client.open(await example('cmyk-levels.psd')));
  expect(await client.merged(multiply.document)).toMatchObject({ ok: false, error: { kind: 'stale' } });
});

it('composites CMYK exactly in its channels without the approximate option', async () => {
  const { client } = connect();
  const cmyk = value(await client.open(await example('cmyk-levels.psd')));
  expect(cmyk.info).toMatchObject({ modeName: 'CMYK', depth: 8 });
  const render = value(await client.render(cmyk.document, settings, []));
  expect(render.depth).toBe(8);
  // Only the display conversion to sRGB is approximate.
  expect(render.approximations).toHaveLength(1);
  expect(render.approximations[0]).toMatch(/^8-bit CMYK: composited exactly in its CMYK channels; only the display/);
  expect(value(await client.difference(cmyk.document, render.render))).toMatchObject({
    unit: 'CMYK level',
    samples: 96 * 96 * 4,
    differingSamples: 0,
    max: 0
  });
});

it('reproduces a rotated smart object from its cache, and by re-rendering with the interpolation it was placed with', async () => {
  const { client } = connect();
  const { document, layers } = value(await client.open(await example('rotated-smart-object.psd')));
  expect(layers[1]).toMatchObject({ kind: 'smartObject', name: 'owned smart object' });
  const differing: Record<string, number> = {};
  for (const smartObjects of [null, ...interpolations]) {
    // Captured with gamma 1.0 blending.
    const render = value(await client.render(document, { ...settings, linearBlending: true, smartObjects }, []));
    differing[smartObjects ?? 'cached'] = value(await client.difference(document, render.render)).differingSamples;
  }

  // Bicubic, and Bicubic Automatic (Photoshop's default), which rotates with Bicubic's table, reproduce the capture;
  // the other preferences resample differently.
  expect(differing).toMatchObject({ cached: 0, bicubic: 0, bicubicAutomatic: 0 });
  for (const other of ['nearestNeighbor', 'bilinear', 'bicubicSmoother', 'bicubicSharper']) {
    expect(differing[other], other).toBeGreaterThan(0);
  }
});

it('reads a layer in detail with its pixels, and a type layer with its text', async () => {
  const { client } = connect();
  const { document } = value(await client.open(await example('type-with-layer-styles.psd')));
  const text = value(await client.layer(document, 1));
  expect(text.detail).toMatchObject({ name: 'STYLED', kind: 'text', text: { text: 'STYLED', antiAlias: 'Sharp' } });
  const effects = text.detail.effects;
  expect(
    effects &&
      'instances' in effects &&
      effects.instances.filter((effect) => effect.enabled).map((effect) => effect.name)
  ).toEqual(['Stroke', 'Bevel & Emboss']);
  expect(value(text.pixels)).toMatchObject({ left: 18, top: 25, width: 247, height: 48 });

  const render = value(await client.render(document, settings, []));
  expect(value(await client.difference(document, render.render)).differingSamples).toBe(0);
  const withoutTextGamma = value(await client.render(document, { ...settings, textGamma: null }, []));
  expect(value(await client.difference(document, withoutTextGamma.render)).differingSamples).toBeGreaterThan(0);
});

/**
 * The system's Arial and Arial Bold, for re-rendering text; never copied into the repository. Tests that need them
 * skip without them.
 */
const arialPaths = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
];

async function systemFont(path: string): Promise<ArrayBuffer> {
  const bytes = await readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

it('reports the fonts a document needs and refuses to re-render text without them', async () => {
  const { client } = connect();
  const { document } = value(await client.open(await example('type-with-layer-styles.psd')));
  expect(value(await client.fonts())).toEqual([]);
  expect(value(await client.documentFonts(document))).toEqual({
    fonts: [{ name: 'Arial-BoldMT', available: false, layers: [1] }],
    layers: [{ index: 1, name: 'STYLED', visible: true, fonts: ['Arial-BoldMT'] }]
  });
  expect(value(await client.textSupport(document, 0))).toBeNull();
  expect(value(await client.textSupport(document, 1))).toEqual({
    fonts: ['Arial-BoldMT'],
    missing: ['Arial-BoldMT'],
    supported: false,
    reason: 'text rendering: font Arial-BoldMT was not supplied'
  });

  // The exact render fails with the renderer's reason; the approximate one keeps the cached raster and says so.
  const typeLayers = { ...settings, typeLayers: true };
  expect(await client.render(document, typeLayers, [])).toEqual({
    ok: false,
    error: { kind: 'unsupported', message: expect.stringContaining('font Arial-BoldMT was not supplied') }
  });
  const approximate = value(await client.render(document, { ...typeLayers, approximate: true }, []));
  expect(approximate.approximations).toEqual([
    expect.stringMatching(
      /^“STYLED”: .*font Arial-BoldMT was not supplied — composited from the raster Photoshop cached/
    )
  ]);
  expect(value(await client.difference(document, approximate.render)).differingSamples).toBe(0);

  const refused = value(await client.addFonts([new Uint8Array(64).buffer]));
  expect(refused.results).toEqual([{ ok: false, error: { kind: 'invalid', message: expect.any(String) } }]);
  expect(refused.fonts).toEqual([]);
});

it.skipIf(!arialPaths.every((path) => existsSync(path)))(
  're-renders a Sharp Arial Bold type layer from its text and compares it with the merged image',
  async () => {
    const { client, sent, transferred } = connect();
    const { document } = value(await client.open(await example('type-with-layer-styles.psd')));
    const fonts = await Promise.all(arialPaths.map(systemFont));
    const added = value(await client.addFonts(fonts));
    // The buffers are transferred, not copied.
    expect(transferred[sent.findIndex((request) => request.type === 'addFonts')]).toEqual(fonts);
    expect(added.results.map((result) => result.ok && result.value.name)).toEqual(['ArialMT', 'Arial-BoldMT']);
    expect(value(await client.fonts()).map((entry) => entry.name)).toEqual(['Arial-BoldMT', 'ArialMT']);
    expect(value(await client.documentFonts(document)).fonts).toEqual([
      { name: 'Arial-BoldMT', available: true, layers: [1] }
    ]);
    expect(value(await client.textSupport(document, 1))).toEqual({
      fonts: ['Arial-BoldMT'],
      missing: [],
      supported: true
    });

    // Re-rendered from its text, the layer under its Stroke and Bevel & Emboss matches Photoshop's merged image.
    const render = value(await client.render(document, { ...settings, typeLayers: true }, []));
    expect(render.approximations).toEqual([]);
    expect(value(await client.difference(document, render.render))).toMatchObject({
      samples: 92160,
      differingSamples: 0,
      max: 0
    });
  }
);

it('fails every pending and later request once the worker crashes', async () => {
  const sent: PsdRequest[] = [];
  const port: PsdWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: (message) => sent.push(message)
  };
  const client = makePsdClient(port);
  const pending = client.merged(1);
  const render = client.render(1, settings, []);
  port.onerror?.({ message: 'out of memory' });
  await expect(pending).rejects.toThrow('out of memory');
  await expect(render).rejects.toThrow('out of memory');
  await expect(client.layer(1, 0)).rejects.toThrow('out of memory');
  client.dispose();
  expect(port.terminate).toHaveBeenCalledOnce();
});
