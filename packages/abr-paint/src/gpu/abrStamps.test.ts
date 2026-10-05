import { percent, pixels } from '@app-game/abr-parser';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import { beforeEach, expect, it, vi } from 'vitest';
import { prepareAbrBrush } from '../preset';
import type { BrushResource } from '../resources';
import { abrShaderEntryPoints, flagsLane, Params, paramsOffsets } from './abrShaders';
import { createAbrStamps, type AbrRasterSettings } from './abrStamps';
import { createAbrTextureCache } from './abrTextureCache';

vi.mock('./abrShaders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./abrShaders')>()),
  createAbrPipelines: () => ({})
}));

let gpu: ReturnType<typeof createFakeRoot>;

beforeEach(() => {
  gpu = createFakeRoot();
});

it('reuses the tip texture when the next stroke wraps the same resource ID in a new object', () => {
  const stamps = createAbrStamps(gpu.root);
  const settings = roundSettings();

  stamps.prepare(settings);
  stamps.prepare({ ...settings, tip: { ...settings.tip } });

  expect(stamps.stats()).toMatchObject({ uploads: 1, textures: 1 });
  expect(gpu.textures.filter((texture) => texture.destroyed)).toHaveLength(0);
});

it('rejects a preset over the device limits without disturbing the prepared one', () => {
  const stamps = createAbrStamps(gpu.root);
  const settings = { ...roundSettings(), smudge: { strength: 1, fingerPainting: false, allLayers: false, layers: ['layer'] } };
  stamps.prepare(settings);

  const huge = resource('huge', gpu.limit + 1, 1);
  expect(() => stamps.prepare({ ...settings, tip: huge })).toThrow('texture size');

  expect(stamps.stats()).toMatchObject({ uploads: 1, textures: 1 });
  expect(gpu.textures.some((texture) => texture.destroyed)).toBe(false);
  expect(stamps.canDrawDirect()).toBe(true);
});

it('releases everything and becomes unprepared when an upload fails', () => {
  const stamps = createAbrStamps(gpu.root);
  const settings = { ...roundSettings(), smudge: { strength: 1, fingerPainting: false, allLayers: false, layers: ['layer'] } };
  stamps.prepare(settings);

  gpu.failNextTexture = true;
  expect(() => stamps.prepare({ ...settings, tip: resource('next', 4, 4) })).toThrow('out of memory');

  expect(stamps.stats()).toMatchObject({ textures: 0 });
  expect(gpu.textures.every((texture) => texture.destroyed)).toBe(true);
  expect(stamps.canDrawDirect()).toBe(false);

  stamps.prepare(settings);
  expect(stamps.stats()).toMatchObject({ uploads: 2, textures: 1 });
});

it('evicts least-recently used textures by ID while keeping required ones', () => {
  const cache = createAbrTextureCache(gpu.root, { maxEntries: 2 });
  const [a] = cache.acquire([resource('a', 2, 2)], 0);
  cache.acquire([resource('b', 2, 2)], 0);
  cache.acquire([resource('a', 2, 2)], 0);
  cache.acquire([resource('c', 2, 2)], 0);

  expect(cache.size).toBe(2);
  expect(cache.uploads).toBe(3);
  expect(cache.acquire([resource('a', 2, 2)], 0)[0]).toBe(a);
  expect(cache.uploads).toBe(3);
});

it('resolves every ABR shader entry point with named uniform lanes', () => {
  for (const entry of Object.values(abrShaderEntryPoints)) {
    expect(() => tgpu.resolve([entry as never])).not.toThrow();
  }

  expect(tgpu.resolve([abrShaderEntryPoints.compositeFragment as never])).toContain(`flags[${flagsLane.dual}i]`);
  expect(paramsOffsets.maskColor * 4 + 16).toBe(d.sizeOf(Params));
});

function roundSettings(): AbrRasterSettings<string> {
  const preset = prepareAbrBrush({
    id: 'round',
    name: 'Round',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      tip: { kind: 'computed', diameter: pixels(16), spacing: percent(25), hardness: percent(100) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  return { values: preset.engine.settings.values, tip: preset.resource, size: 16, mixing: 'linear' };
}

function resource(id: string, width: number, height: number): BrushResource {
  return { id, width, height, format: 'r8unorm', pixels: new Uint8Array(width * height) };
}

/** Records texture lifetimes; no WebGPU device is involved. */
function createFakeRoot() {
  const textures: { props: { size: [number, number] }; destroyed: boolean }[] = [];
  const state = {
    limit: 8192,
    failNextTexture: false,
    textures,
    root: undefined as unknown as TgpuRoot
  };
  const fake = {
    device: {
      limits: { maxTextureDimension2D: state.limit },
      queue: { writeTexture: vi.fn(), writeBuffer: vi.fn() }
    },
    unwrap: (value: unknown) => value,
    createBuffer: () => {
      const buffer = { $usage: () => buffer, destroy: vi.fn() };
      return buffer;
    },
    createTexture: ({ size }: { size: [number, number] }) => {
      if (state.failNextTexture) {
        state.failNextTexture = false;
        throw new Error('out of memory');
      }

      const texture = {
        props: { size },
        destroyed: false,
        $usage: () => texture,
        generateMipmaps: vi.fn(),
        destroy: () => {
          texture.destroyed = true;
        }
      };
      textures.push(texture);
      return texture;
    }
  };
  state.root = fake as unknown as TgpuRoot;
  return state;
}
