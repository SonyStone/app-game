import { expect, it, vi } from 'vitest';
import { abrCoveragePlan, createAbrCoverage } from './coverage';
import { commandBatch } from './commandBatch';

it('captures only used channels and keeps dual coverage at full resolution across all supported LODs', () => {
  const h = harness();
  for (const scale of [1, 2, 4, 8]) {
    for (const mask of [false, true]) {
      for (const dual of [false, true]) {
        const plan = abrCoveragePlan({ mask, dual, scale, transient: false });
        expect(plan.count).toBe(1 + Number(mask) + Number(dual));
        const sources = plan.sources(h.coverage);
        expect(sources.map(s => s.side)).toEqual([
          ...(mask ? [256 / scale] : []), 256 / scale, ...(dual ? [256] : [])
        ]);
        const bytes = sources.map(({ side }) => new Uint8Array(side * side * 4));
        const snapshot = plan.snapshot([new Uint8Array(4), ...bytes], 1);
        expect(snapshot.every((item, i) => item.pixels === bytes[i])).toBe(true);
        h.coverage.restore(snapshot, p => p);
        expect(h.writes.splice(0).map(call => call[3])).toEqual(sources.map(({ side }) => [side, side]));
      }
    }
  }
  const transient = abrCoveragePlan({ mask: true, dual: true, scale: 8, transient: true });
  expect(transient.count).toBe(0);
  expect(transient.sources(h.coverage)).toEqual([]);
  expect(transient.snapshot([])).toEqual([]);
});

it('restores compact masks without decoding them and decodes full-size host snapshots', () => {
  const h = harness();
  const compact = new Uint8Array(32 * 32 * 4), packed = new Uint8Array([1, 2, 3]);
  const full = new Uint8Array(256 * 256 * 4);
  const decode = vi.fn(() => full);
  h.coverage.restore([{ channel: 'paint', side: 32, pixels: compact }, { channel: 'dual', side: 256, pixels: packed }], decode);
  expect(decode).toHaveBeenCalledExactlyOnceWith(packed);
  expect(h.writes[0]![1]).toBe(compact);
  expect(h.writes[1]![1]).toBe(full);
  expect(h.cleared).toEqual(['mask']); // Scratch may previously have belonged to a different preset.
  expect(h.submits).toHaveBeenCalledOnce();
});

it('validates the complete restore before any upload or clear', () => {
  const h = harness();
  expect(() => h.coverage.restore([
    { channel: 'mask', side: 32, pixels: new Uint8Array(4096) },
    { channel: 'paint', side: 32, pixels: new Uint8Array(3) }
  ], p => p)).toThrow('size');
  expect(h.writes).toEqual([]);
  expect(h.cleared).toEqual([]);
  expect(() => abrCoveragePlan({ scale: 3, mask: true, dual: false, transient: false })).toThrow('scale');
  expect(() => abrCoveragePlan({ scale: 1, mask: true, dual: true, transient: false }).snapshot([])).toThrow('readback');
});

it('copies all channels for preview and preserves secondary coverage between sampling dabs', () => {
  const source = harness(), destination = harness();
  const commands = commandBatch(destination.device);
  destination.coverage.copyFrom(source.coverage, commands);
  expect(destination.copies).toHaveLength(3);
  expect(destination.copies.map(args => args[0].texture)).toEqual(Object.values(source.coverage.textures));
  expect(destination.submits).not.toHaveBeenCalled(); // Borrowed batches belong to the caller.
  commands.flush();
  destination.coverage.clear(commands, false);
  expect(destination.cleared).toEqual(['mask', 'paint']);
  commands.flush();
  destination.cleared.length = 0;
  destination.coverage.copyFrom(undefined, commands);
  expect(destination.cleared).toEqual(['mask', 'paint', 'dual']);
  commands.flush();
});

/** Records resource lifetime operations. Pixel equivalence is exercised by the real-device renderer checks. */
function harness() {
  const writes: Parameters<GPUQueue['writeTexture']>[] = [];
  const copies: Parameters<GPUCommandEncoder['copyTextureToTexture']>[] = [];
  const cleared: string[] = [];
  const submits = vi.fn();
  const device = {
    queue: { writeTexture: (...args: Parameters<GPUQueue['writeTexture']>) => { writes.push(args); }, submit: submits },
    createCommandEncoder: () => ({
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
        cleared.push(...Array.from(descriptor.colorAttachments).map(a => (a!.view as GPUTextureView).label));
        return { end() {} };
      },
      copyTextureToTexture: (...args: Parameters<GPUCommandEncoder['copyTextureToTexture']>) => { copies.push(args); },
      finish: () => ({})
    })
  } as unknown as GPUDevice;
  const texture = (label: string) => ({ createView: () => ({ label }) }) as unknown as GPUTexture;
  const coverage = createAbrCoverage(device, { mask: texture('mask'), paint: texture('paint'), dual: texture('dual') });
  return { coverage, writes, copies, cleared, submits, device };
}
