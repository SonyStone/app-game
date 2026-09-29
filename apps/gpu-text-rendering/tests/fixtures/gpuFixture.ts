import { ok } from 'neverthrow';
import { vi } from 'vitest';
import type { GpuContext } from '../../src/shared/gpu/context';

/** A command-recording GPU double; rendering and JSX lifetime tests share the real submission path. */
export function gpuFixture(signal = new AbortController().signal) {
  const pass = { end: vi.fn() };
  const command = {};
  const encoder = { beginRenderPass: vi.fn(() => pass), finish: vi.fn(() => command) };
  // A real element, so scene pointer dispatch can attach listeners and capture pointers.
  const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 600 });
  const gpu = {
    signal,
    checkActive: vi.fn(() => ok()),
    device: {
      limits: { maxTextureDimension2D: 8192 },
      createCommandEncoder: vi.fn(() => encoder),
      queue: { submit: vi.fn(), onSubmittedWorkDone: vi.fn(async () => {}) }
    },
    context: {
      canvas,
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) }))
    }
  } as unknown as GpuContext;

  return { gpu, pass, encoder, command };
}
