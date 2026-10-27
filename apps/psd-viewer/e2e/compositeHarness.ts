import { writePsd, type PsdLayer } from '@app-game/psd';
import { gpuBlendModes, prepareGpuLayers, type PsdGpuLayers } from '@app-game/psd/gpu';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { makeGpuCompositor, type GpuTileWork } from '../src/features/gpu-composite/makeGpuCompositor';
import { cpuCompositeReference } from '../tests/cpuCompositeReference';
import { operandControls } from '../tests/operandControls';
import { withModernTop, withTopBlendKey } from '../tests/patchedPsd';

/** Deliberately includes byte ties, hidden transparent RGB, partial Fill/opacity, and reversed stack ordering. */
export async function runGpuArithmetic() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('GPU compositor test requires WebGPU.');
  }
  const device = await adapter.requestDevice({
    requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : []
  });
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const compositor = makeGpuCompositor(device);
  const width = 256;
  const height = 256;
  const rect = { left: 0, top: 0, width, height };
  const results: { mode: string; gamma: boolean; variant: number; differing: number; samples: number }[] = [];
  try {
    for (const variant of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const source: PsdGpuLayers = {
        capability: 'rgb8-integer-v2',
        rect,
        layers: [0, 1].map((index) => ({
          index,
          bounds: rect,
          visible: true,
          ancestors: [],
          opacity: index === 1 ? ([255, 77, 255, 255, 0, 1, 127, 254, 255][variant] ?? 255) : 255,
          fill: index === 1 ? ([255, 255, 128, 255, 255, 1, 77, 200, 254][variant] ?? 255) : 255,
          mode: 0,
          density: variant === 3 ? 173 : 255,
          samples: new Uint32Array(width * height * 2)
        }))
      };
      for (let b = 0; b < 256; b++) {
        for (let s = 0; s < 256; s++) {
          const at = (b * width + s) * 2;
          const alpha = variant === 0 ? 255 : (b * 17 + s * 31) % 256;
          source.layers[0].samples[at] = (b | ((255 - b) << 8) | (s << 16) | (alpha << 24)) >>> 0;
          source.layers[1].samples[at] =
            (s | (b << 8) | ((255 - s) << 16) | ((variant === 0 ? 255 : (s * 13 + b * 7) % 256) << 24)) >>> 0;
          source.layers[0].samples[at + 1] = variant === 3 ? b : 255;
          source.layers[1].samples[at + 1] = variant === 3 ? s : 255;
        }
      }
      if (variant === 3) {
        source.layers.reverse();
      }
      if (variant === 9) {
        source.layers[1].clipBase = 0;
      }
      if (variant === 10) {
        source.layers[1].ancestors = [2];
        const samples = new Uint32Array(width * height * 2);
        for (let i = 0; i < samples.length; i += 2) {
          samples[i] = 0xff000000;
          samples[i + 1] = 255;
        }
        source.layers.splice(1, 0, {
          ...source.layers[0],
          index: 2,
          opacity: 173,
          isolated: true,
          staged: true,
          samples
        });
      }
      if (variant === 11) {
        source.layers[1].staged = true;
        source.layers[1].textGamma = true;
      }
      for (const [mode, name] of gpuBlendModes.entries()) {
        source.layers[variant === 10 ? 2 : 1].mode = mode;
        for (const gamma of [false, true]) {
          const expected = cpuCompositeReference(source, gamma);
          const actual = await composite(device, compositor, {
            identity: `${variant}:${mode}:${gamma}`,
            sourceKey: `grid:${variant}`,
            source,
            visibility: [],
            groupVisibility: new Map(),
            linearBlending: gamma
          });
          let differing = 0;
          for (let i = 0; i < expected.length; i++) {
            differing += actual[i] !== expected[i] ? 1 : 0;
          }
          results.push({ mode: name, gamma, variant, differing, samples: expected.length });
        }
      }
    }
    return { results, errors };
  } finally {
    compositor.destroy();
    device.destroy();
  }
}

/** Uses actual strict renderRegion as the oracle, independently of the scalar arithmetic test. */
export async function runGpuFixture(bytes: number[]) {
  const opened = await openPsd(Uint8Array.from(bytes));
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const compositor = makeGpuCompositor(device);
  const results = [];
  try {
    const rects = [
      {
        left: 0,
        top: 0,
        width: Math.min(128, opened.value.info.width),
        height: Math.min(128, opened.value.info.height)
      }
    ];
    if (opened.value.info.width > 128 && opened.value.info.height > 128) {
      rects.push({
        left: Math.floor(opened.value.info.width / 2) - 64,
        top: Math.floor(opened.value.info.height / 2) - 64,
        width: 128,
        height: 128
      });
    }
    for (const gamma of [false, true]) {
      for (const rect of rects) {
        const settings = { ...photoshopDefaultSettings, linearBlending: gamma };
        const preparing = performance.now();
        const source = prepareGpuLayers(opened.value, rect, settings);
        const preparationMs = performance.now() - preparing;
        if (!source.ok) {
          results.push({ gamma, refused: source.error.message });
          continue;
        }
        for (const visibility of [
          [],
          ...source.value.layers.slice(0, 4).map((layer) => [[layer.index, !layer.visible] as const])
        ]) {
          const strict = opened.value.renderRegion(
            rect,
            { ...settings, maxWorkPixels: 4_194_304, budget: { liveBytes: 2 * 1024 ** 3 } },
            visibility
          );
          if (!strict.ok) {
            throw new Error(strict.error.message);
          }
          const groupVisibility = new Map<number, boolean>();
          const groups = (nodes: typeof opened.value.layers) => {
            for (const node of nodes) {
              groupVisibility.set(node.index, node.visible);
              if (node.children) {
                groups(node.children);
              }
            }
          };
          groups(opened.value.layers);
          const actual = await composite(device, compositor, {
            identity: JSON.stringify([rect, settings, visibility]),
            sourceKey: JSON.stringify([rect, gamma]),
            source: source.value,
            visibility,
            groupVisibility,
            linearBlending: gamma
          });
          let differing = 0;
          for (let i = 0; i < actual.length; i++) {
            differing += actual[i] !== strict.value.pixels[i] ? 1 : 0;
          }
          results.push({
            gamma,
            rect,
            visibility,
            differing,
            samples: actual.length,
            preparationMs,
            operandBytes: source.value.layers.reduce((sum, layer) => sum + layer.samples.byteLength, 0)
          });
        }
      }
    }
    return results;
  } finally {
    compositor.destroy();
    device.destroy();
    opened.value.close();
  }
}

/** Builds a modern, populated RGB8 raster stack for resident-toggle and memory measurements. */
export async function createCompositeFixture(width = 1024, height = 768, count = 12) {
  const layers: PsdLayer[] = [];
  for (let layer = 0; layer < count; layer++) {
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels.set(
        [
          (i + layer * 31) & 255,
          (i * 17 + layer * 7) & 255,
          (i * 3 + layer * 11) & 255,
          layer === 0 ? 255 : (i + layer * 23) & 255
        ],
        i * 4
      );
    }
    layers.push({
      name: `Raster ${layer}`,
      left: 0,
      top: 0,
      width,
      height,
      pixels,
      visible: true,
      opacity: layer === 0 ? 1 : 128 / 255,
      fill: 1,
      blend: 'normal',
      clipping: false,
      transparencyLocked: false
    });
  }
  const bytes = await writePsd({ width, height, layers }, layers[0].pixels);
  return [...new Uint8Array(withTopBlendKey(withModernTop(bytes), 'norm'))];
}

async function composite(
  device: GPUDevice,
  compositor: ReturnType<typeof makeGpuCompositor>,
  work: Omit<GpuTileWork, 'onReadback' | 'onFailure'>
): Promise<Uint8Array> {
  const texture = device.createTexture({
    size: [work.source.rect.width, work.source.rect.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING
  });
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const encoder = device.createCommandEncoder();
      const encoded = compositor.encode(
        { ...work, onReadback: resolve, onFailure: (reason) => reject(new Error(reason)) },
        encoder,
        texture
      );
      if (!encoded) {
        return;
      }
      device.queue.submit([encoder.finish()]);
      compositor.submitted();
    });
  } finally {
    texture.destroy();
  }
}

/** Strict PSD controls exercise clipping and per-pixel adjustments on the actual integer GPU pipeline. */
export async function runGpuOperandControls() {
  const results = [];
  for (const control of await operandControls()) {
    results.push({ name: control.name, scenarios: await runGpuFixture([...control.bytes]) });
  }
  return results;
}
