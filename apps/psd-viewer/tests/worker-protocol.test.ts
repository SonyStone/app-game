import {
  loadPsdViewer,
  photoshopDefaultSettings,
  type PsdInterpolation,
  type PsdRenderSettings
} from '@app-game/psd/viewer';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { withDifferentFontVersion } from '../../../packages/psd/test/fontRelease';
import { makePsdClient, type PsdResultOf, type PsdWorkerPort } from '../src/features/psd-worker';
import type { PsdReply, PsdRequest } from '../src/features/psd-worker/protocol';
import { makePsdWorkerHost } from '../src/features/psd-worker/workerHost';
import { truncated, withChannelCompression } from './damagedPsd';
import { withTopBlendKey } from './patchedPsd';

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

it('reuses detection renders for equal Gray profiles and invalidates them when profile bytes change', async () => {
  const { client } = connect();
  const opened = value(await client.open(await example('adjustment-stack.psd')));
  const codec = await loadPsdViewer();
  const render = vi.spyOn(codec.PsdDocumentHandle.prototype, 'render');
  const profiled = { ...settings, grayProfile: Uint8Array.of(1, 2, 3) };
  try {
    value(await client.detectBlending(opened.document, profiled, []));
    const detected = render.mock.calls.length;
    expect(detected).toBeGreaterThan(0);
    value(await client.render(opened.document, { ...profiled, grayProfile: profiled.grayProfile.slice() }, []));
    expect(render).toHaveBeenCalledTimes(detected);

    value(await client.detectBlending(opened.document, profiled, []));
    const beforeChange = render.mock.calls.length;
    value(await client.render(opened.document, { ...profiled, grayProfile: Uint8Array.of(1, 2, 4) }, []));
    expect(render).toHaveBeenCalledTimes(beforeChange + 1);
    expect(render.mock.lastCall?.[0]).toMatchObject({ grayProfile: Uint8Array.of(1, 2, 4) });
  } finally {
    render.mockRestore();
    client.dispose();
  }
});

it('reuses a prepared render when absent state becomes null and defaults are explicit', async () => {
  const { client } = connect();
  const opened = value(await client.open(await example('adjustment-stack.psd')));
  const codec = await loadPsdViewer();
  const render = vi.spyOn(codec.PsdDocumentHandle.prototype, 'render');
  try {
    value(await client.detectBlending(opened.document, settings, []));
    const composites = render.mock.calls.length;
    value(
      await client.render(
        opened.document,
        {
          ...settings,
          state: null,
          grayProfile: null,
          availableFonts: null
        },
        []
      )
    );
    expect(render).toHaveBeenCalledTimes(composites);

    value(await client.detectBlending(opened.document, { ...settings, state: null }, []));
    const next = render.mock.calls.length;
    value(await client.render(opened.document, settings, []));
    expect(render).toHaveBeenCalledTimes(next);
  } finally {
    render.mockRestore();
    client.dispose();
  }
});

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

it('detects the gamma blending options a document was saved with, and reuses its render', async () => {
  const { client } = connect();
  // Captured with gamma 1.0 blending.
  const gammaOne = value(await client.open(await example('pass-through-groups.psd')));
  const detected = value(await client.detectBlending(gammaOne.document, settings, []));
  expect(detected).toMatchObject({ linearBlending: true, differing: { linear: 0 } });
  expect(detected.differing.encoded).toBeGreaterThan(0);
  const render = value(await client.render(gammaOne.document, { ...settings, linearBlending: true }, []));
  expect(value(await client.difference(gammaOne.document, render.render)).differingSamples).toBe(0);

  // Captured with Photoshop's default Color Settings.
  const encoded = value(await client.open(await example('type-with-layer-styles.psd')));
  expect(value(await client.detectBlending(encoded.document, settings, []))).toMatchObject({
    linearBlending: false,
    textGamma: null,
    differing: { encoded: 0, otherTextGamma: null }
  });

  // Its type layer was blended with text gamma: with the option off, the detection turns it back on.
  const withoutTextGamma = value(await client.detectBlending(encoded.document, { ...settings, textGamma: null }, []));
  expect(withoutTextGamma).toMatchObject({ linearBlending: false, textGamma: true, differing: { otherTextGamma: 0 } });
  const reused = value(await client.render(encoded.document, settings, []));
  expect(value(await client.difference(encoded.document, reused.render)).differingSamples).toBe(0);
});

it('reports unreadable files, unsupported settings and approximations as typed failures', async () => {
  const { client } = connect();
  expect(await client.open(new Uint8Array(64).buffer)).toEqual({
    ok: false,
    error: {
      kind: 'refused',
      message:
        'Photoshop 26 does not open this file: not a Photoshop document, "Cannot open the file because the open options are incorrect" (error 8000)'
    }
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
  expect(render.pixels).toEqual(value(await client.merged(cmyk.document)).pixels);
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
    layers: [{ index: 1, name: 'STYLED', visible: true, fonts: ['Arial-BoldMT'] }],
    releaseMismatches: []
  });
  expect(value(await client.textSupport(document, 0))).toBeNull();
  expect(value(await client.textSupport(document, 1))).toEqual({
    fonts: ['Arial-BoldMT'],
    missing: ['Arial-BoldMT'],
    releaseMismatches: [],
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
    expect(added.results.map((result) => result.ok && result.value.map((face) => face.name))).toEqual([
      ['ArialMT'],
      ['Arial-BoldMT']
    ]);
    expect(value(await client.fonts()).map((entry) => entry.name)).toEqual(['Arial-BoldMT', 'ArialMT']);
    expect(value(await client.documentFonts(document))).toEqual({
      fonts: [{ name: 'Arial-BoldMT', available: true, layers: [1] }],
      layers: [{ index: 1, name: 'STYLED', visible: true, fonts: ['Arial-BoldMT'] }],
      releaseMismatches: []
    });
    expect(value(await client.textSupport(document, 1))).toEqual({
      fonts: ['Arial-BoldMT'],
      missing: [],
      releaseMismatches: [],
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

it.skipIf(!existsSync(arialPaths[1]!))(
  'preserves supplied release mismatches separately from missing fonts through the worker',
  async () => {
    const { client } = connect();
    const { document } = value(await client.open(await example('type-with-layer-styles.psd')));
    value(await client.addFonts([withDifferentFontVersion(await systemFont(arialPaths[1]!))]));
    const report = value(await client.documentFonts(document));
    expect(report.fonts).toEqual([{ name: 'Arial-BoldMT', available: true, layers: [1] }]);
    expect(report.releaseMismatches).toEqual([
      {
        name: 'Arial-BoldMT',
        reason: 'font present but a different release',
        recordedVersion: 'Version 5.01.2x',
        suppliedVersion: expect.stringMatching(/^X+$/)
      }
    ]);
    expect(value(await client.textSupport(document, 1))).toEqual({
      fonts: ['Arial-BoldMT'],
      missing: [],
      releaseMismatches: report.releaseMismatches,
      supported: false,
      reason: 'font present but a different release'
    });
    expect(value(await client.textSupport(document, 0))).toBeNull();
    client.dispose();
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

it('opens like Photoshop: strict files as before, prompts sent back for an answer, refusals named', async () => {
  const { client, sent } = connect();
  const intact = value(await client.open(await example('pass-through-groups.psd')));
  expect(intact.opening).toEqual({ reader: 'strict', alerts: [], repairs: [] });

  // "probe top"'s red channel gets compression code 4: Photoshop asks, and OK reads the channel as 255.
  const corrupt = withChannelCompression(await example('pass-through-groups.psd'), 4, 1);
  const message = 'This file contains one or more layers which appear to be corrupt.  Continue reading layers?';
  expect(await client.open(corrupt.slice(0))).toEqual({
    ok: false,
    error: {
      kind: 'needsAnswer',
      message,
      prompt: {
        id: 'corruptLayers',
        message,
        buttons: [
          { answer: 'ok', label: 'OK', default: true },
          { answer: 'flatten', label: 'Flatten', default: false },
          { answer: 'cancel', label: 'Cancel', default: false }
        ]
      }
    }
  });

  const continued = value(await client.open(corrupt.slice(0), { corruptLayers: 'ok' }));
  expect(sent.at(-1)).toMatchObject({ type: 'open', answers: { corruptLayers: 'ok' } });
  expect(continued.layers.map((layer) => layer.name)).toEqual(intact.layers.map((layer) => layer.name));
  expect(continued.opening).toEqual({
    reader: 'photoshop',
    alerts: [{ kind: 'corruptLayers', message, answer: 'OK' }],
    repairs: ['Channels read as Photoshop decodes them in "probe top"']
  });
  // Recovered documents render, compare and detect their blending options like any other.
  // The example was captured with gamma 1.0 blending, which still reproduces the merged image more closely.
  expect(value(await client.detectBlending(continued.document, settings, []))).toMatchObject({
    linearBlending: true,
    differing: { encoded: 624, linear: 207 }
  });
  const render = value(await client.render(continued.document, { ...settings, linearBlending: true }, []));
  expect(value(await client.difference(continued.document, render.render)).differingSamples).toBe(207);

  const flattened = value(await client.open(corrupt.slice(0), { corruptLayers: 'flatten' }));
  expect(flattened.layers).toEqual([]);
  expect(flattened.opening.repairs).toEqual(['The stored composite opened as the Background instead of the layers']);
  const flat = value(await client.render(flattened.document, settings, []));
  expect(value(await client.difference(flattened.document, flat.render)).differingSamples).toBe(0);

  const cancelled = await client.open(corrupt.slice(0), { corruptLayers: 'cancel' });
  expect(cancelled).toEqual({
    ok: false,
    error: {
      kind: 'refused',
      message: `Photoshop 26 does not open this file: Photoshop asks "${message.replace('  ', ' ')}" and Cancel opens nothing`
    }
  });

  const cut = await client.open(truncated(await example('pass-through-groups.psd'), 20_000));
  expect(cut).toMatchObject({ ok: false, error: { kind: 'refused' } });
  expect(!cut.ok && cut.error.message).toContain('extends past its container');
});

it("renders a saved layer comp and animation frame as Photoshop's saves with them selected", async () => {
  const { client } = connect();
  const comps = value(await client.open(await example('layer-comps.psd')));
  expect(comps.states.comps.map((comp) => comp.name)).toEqual(['first', 'second', 'third']);
  expect(comps.states.frames).toEqual([]);
  const second = comps.states.comps[1]!.id;
  const comp = value(await client.render(comps.document, { ...settings, state: { comp: second } }, []));
  expect(comp.approximations).toEqual([]);
  const compSaved = value(await client.open(await testAsset('layer-comps-second.psd')));
  expect(comp.pixels).toEqual(value(await client.merged(compSaved.document)).pixels);

  const frames = value(await client.open(await testAsset('frames.psd')));
  expect(frames.states.frames).toHaveLength(3);
  // The second frame is the saved one; the third changes the document.
  expect(frames.states.activeFrame).toBe(frames.states.frames[1]!.id);
  const frame = value(
    await client.render(frames.document, { ...settings, state: { frame: frames.states.frames[2]!.id } }, [])
  );
  const frameSaved = value(await client.open(await testAsset('frames-third.psd')));
  expect(frame.pixels).toEqual(value(await client.merged(frameSaved.document)).pixels);
});

it('opens an older Color Dodge layer as Photoshop 26 does, its stored opacity as Fill', async () => {
  const { client } = connect();
  const legacy = value(await client.open(await testAsset('legacy-opacity.psd')));
  const top = legacy.layers.at(-1)!;
  expect(top).toMatchObject({
    blendMode: 'colorDodge',
    opacity: 255,
    fill: 68,
    transparencyShapesLayer: false,
    legacyOpacity: { storedOpacity: 68, inferredVersion: 50 }
  });
  expect(legacy.layers[1]).toMatchObject({ opacity: 122, fill: 255, legacyOpacity: null });

  // Captured with gamma 1.0 blending; the render is exact, not an approximation.
  const render = value(await client.render(legacy.document, { ...settings, linearBlending: true }, []));
  expect(render.approximations).toEqual([]);
  const saved = value(await client.open(await testAsset('legacy-opacity-photoshop.psd')));
  expect(render.pixels).toEqual(value(await client.merged(saved.document)).pixels);
});

/** A document of `tests/assets`. */
async function testAsset(name: string): Promise<ArrayBuffer> {
  const bytes = await readFile(new URL(`assets/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const helveticaCollection = '/System/Library/Fonts/HelveticaNeue.ttc';

it.skipIf(!existsSync(helveticaCollection))(
  'registers real TTC faces with original indices across documents',
  async () => {
    const { client } = connect();
    const added = value(await client.addFonts([await systemFont(helveticaCollection)], ['HelveticaNeue.ttc']));
    const faces = added.results[0];
    expect(faces?.ok).toBe(true);
    if (!faces?.ok) {
      throw new Error('collection registration failed');
    }

    for (const [name, faceIndex] of [
      ['HelveticaNeue', 0],
      ['HelveticaNeue-Bold', 1],
      ['HelveticaNeue-Light', 7],
      ['HelveticaNeue-Medium', 10]
    ] as const) {
      expect(faces.value.find((face) => face.name === name)).toMatchObject({ faceIndex, active: true, raster: false });
    }

    const first = value(await client.open(await example('type-with-layer-styles.psd')));
    const baseline = value(await client.render(first.document, settings, []));
    // A partial collection does not turn Arial into a known-missing active face.
    expect(value(await client.difference(first.document, baseline.render)).differingSamples).toBe(0);
    const second = value(await client.open(await example('type-with-layer-styles.psd')));
    expect(value(await client.fonts())).toEqual(added.fonts);
    expect(value(await client.render(second.document, settings, [])).pixels).toEqual(baseline.pixels);
    client.dispose();
  }
);

it('abstains from imported font decisions without face bytes, including names-only inventories', async () => {
  const { client } = connect();
  const { document } = value(await client.open(await example('type-with-layer-styles.psd')));
  const baseline = value(await client.render(document, settings, []));
  for (const availableFonts of [undefined, null, [], ['Arial-BoldMT']]) {
    const render = value(await client.render(document, { ...settings, availableFonts }, []));
    expect(render.pixels).toEqual(baseline.pixels);
    expect(render.approximations).toEqual(baseline.approximations);
  }

  client.dispose();
});

it('restarts independently of an old render and keeps the replacement render queue single-flight', async () => {
  const ports: { port: PsdWorkerPort; sent: PsdRequest[] }[] = [];
  function replacement() {
    const sent: PsdRequest[] = [];
    const port: PsdWorkerPort = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (message) => {
        sent.push(message);
      },
      terminate: vi.fn()
    };
    ports.push({ port, sent });
    return port;
  }
  const client = makePsdClient(replacement(), replacement);
  const old = client.render(1, settings, []);
  const waiting = client.render(1, settings, [[1, false]]);
  const oldPort = ports[0].port;
  client.restart();
  expect(oldPort.terminate).toHaveBeenCalledOnce();
  expect(oldPort.onmessage).toBeNull();
  expect(await old).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  expect(await waiting).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  const first = client.render(1, settings, []);
  await Promise.resolve();
  await Promise.resolve();
  const second = client.render(1, settings, [[2, false]]);
  const current = ports[1];
  expect(current.sent).toHaveLength(1);
  const reply = () =>
    current.port.onmessage?.({
      data: { id: current.sent.at(-1)!.id, type: 'failed', error: { kind: 'unsupported', message: 'test reply' } }
    });
  reply();
  await first;
  await vi.waitFor(() => expect(current.sent).toHaveLength(2));
  reply();
  await second;
  client.dispose();
});

it('exposes bounded saved channels and typed saved paths without changing render state', async () => {
  const { client } = connect();
  const opened = value(await client.open(await example('type-with-layer-styles.psd')));
  const before = value(await client.render(opened.document, settings, []));
  const channels = value(await client.channels(opened.document));
  expect(channels.planes.length).toBeGreaterThanOrEqual(3);
  expect(channels.width).toBe(opened.info.width);
  expect(channels.planes[0]!.bytes.length).toBeGreaterThan(0);
  expect(Array.isArray(value(await client.paths(opened.document)))).toBe(true);
  const after = value(await client.render(opened.document, settings, []));
  expect(after.pixels).toEqual(before.pixels);
  client.dispose();
});

it('downloads the byte-identical original after transient visibility and state renders', async () => {
  const { client } = connect();
  const input = await example('layer-comps.psd');
  const original = new Uint8Array(input.slice(0));
  const opened = value(await client.open(input));
  const state = opened.states.comps[0];
  value(await client.render(opened.document, { ...settings, state: state ? { comp: state.id } : null }, [[0, false]]));
  const downloaded = value(await client.original(opened.document));
  expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(original);
  client.dispose();
});

it('refuses oversized layer previews before decoding even on an admitted small canvas', async () => {
  const { client } = connect();
  const opened = value(await client.open(await example('adjustment-stack.psd')));
  const saved = value(await client.layer(opened.document, 0)).detail;
  const codec = await loadPsdViewer();
  const detail = vi.spyOn(codec.PsdDocumentHandle.prototype, 'layerDetail').mockReturnValueOnce({
    ...saved,
    properties: { ...saved.properties, bounds: { left: 0, top: 0, right: 100000, bottom: 100000 } }
  });
  const pixels = vi.spyOn(codec.PsdDocumentHandle.prototype, 'layerPixels');
  try {
    expect(value(await client.layer(opened.document, 0)).pixels).toMatchObject({
      ok: false,
      error: { kind: 'unsupported', message: expect.stringContaining('too large') }
    });
    expect(pixels).not.toHaveBeenCalled();
  } finally {
    detail.mockRestore();
    pixels.mockRestore();
    client.dispose();
  }
});
