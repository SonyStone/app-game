import { vi } from 'vitest';
import type { PaintRenderer, PaintStorage } from '../../src/composition/contracts';
import type { TileChange } from '../../src/document';
import type { TileData } from '../../src/tilePixels';

/**
 * Test double for the WebGPU renderer: every method the runtime calls unconditionally is a `vi.fn` spy with a
 * resolved or empty default. Pass overrides for the methods a test observes or gates. `brushLod` is omitted unless
 * overridden, so the runtime uses its documented default LOD 0.
 */
export function createRendererDouble<Overrides extends Partial<Record<keyof PaintRenderer, unknown>> = {}>(
  overrides: Overrides = {} as Overrides
) {
  const renderer = {
    begin: vi.fn(),
    paint: vi.fn(async (..._args: unknown[]) => {}),
    preview: vi.fn(),
    finish: vi.fn(async (): Promise<TileChange[]> => []),
    cancel: vi.fn(),
    reset: vi.fn(),
    restore: vi.fn(),
    render: vi.fn(async (..._args: unknown[]) => {}),
    submitted: vi.fn(async () => {}),
    invalidateView: vi.fn(),
    recomposite: vi.fn(),
    releaseLayer: vi.fn(),
    releaseTarget: vi.fn(),
    setSelection: vi.fn(),
    setFloating: vi.fn(),
    setLinearBlending: vi.fn(),
    clipStroke: vi.fn(),
    setPixelView: vi.fn(),
    moveFloating: vi.fn(),
    holdPresented: vi.fn(),
    prepareOverview: vi.fn(async (..._args: unknown[]) => {}),
    snapshotTools: vi.fn(async () => ({ version: 1 as const })),
    restoreTools: vi.fn(),
    destroy: vi.fn(),
    stats: () => ({ gpuBytes: 0, residentTiles: 0 }),
    debugTiles: () => [],
    debugPages: () => [],
    ...overrides
  };

  return renderer as Omit<typeof renderer, keyof Overrides> & Overrides & PaintRenderer;
}

/**
 * Storage double that keeps nothing: loads an empty document, returns in-memory tiles and records `save` calls. Overrides replace individual
 * methods, e.g. a `save` that blocks or rejects to simulate a slow or failing checkpoint.
 */
export function createStorageDouble<Overrides extends Partial<Record<keyof PaintStorage, unknown>> = {}>(
  overrides: Overrides = {} as Overrides
) {
  const storage = {
    load: async () => undefined,
    // Nothing is ever stored, so every tile stays in memory and reads return it unchanged.
    capture: (pixels: unknown) => pixels,
    read: async (pixels: TileData) => {
      if (!(pixels instanceof Uint8Array)) {
        throw new Error('The storage double holds no tiles.');
      }

      return pixels;
    },
    save: vi.fn(async (..._args: unknown[]) => {}),
    saveView: vi.fn(async (..._args: unknown[]) => {}),
    stats: () => undefined,
    ...overrides
  };

  return storage as Omit<typeof storage, keyof Overrides> & Overrides & PaintStorage;
}
