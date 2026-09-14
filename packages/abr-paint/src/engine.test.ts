import { expect, it, vi } from 'vitest';
import { abrBrushSettings, createAbrStroke, runAbrBrushCommand } from './index';
import { prepareAbrBrush } from './preset';
import { createBrushResources } from './resources';
import type { AbrBrushInput, AbrStrokeContext } from './contracts';
import type { Dab } from './input';

it('runs with opaque host layer/history types, preserving stroke order and committed changes', async () => {
  const host = createHost();
  const stroke = createAbrStroke(host.context);
  try {
    await stroke.add([{ x: 1, y: 2, pressure: 1, time: 0 }, { x: 101, y: 2, pressure: 1, time: 100 }]);
    expect(host.dabs.length).toBeGreaterThan(1);
    expect(host.dabs[0]!.x).toBe(1);
    expect(host.dabs.at(-1)!.x).toBeGreaterThan(95);
    stroke.preview(true);
    expect(await stroke.finish()).toEqual(['host-owned-change']);
    expect(host.begin).toHaveBeenCalledWith(host.context.layer, host.context.brush, undefined,
      expect.objectContaining({ tip: expect.objectContaining({ id: host.context.settings.tipId }) }));
  } finally { host.release(); }
});

it('rejects missing resources before starting GPU state and cancels through the host', () => {
  const host = createHost();
  try {
    expect(() => createAbrStroke({ ...host.context, settings: { ...host.context.settings, tipId: 'missing' } }))
      .toThrow('not loaded');
    expect(host.begin).not.toHaveBeenCalled();
    createAbrStroke(host.context).cancel();
    expect(host.cancel).toHaveBeenCalledOnce();
  } finally { host.release(); }
});

it('routes idle Mixer commands without allocating a stroke', () => {
  const host = createHost();
  try {
    const context = { ...host.context, command: 'clean' as const };
    expect(() => runAbrBrushCommand(context)).toThrow('Mixer Brush');
    context.settings.values.tool.type = 'MixB';
    runAbrBrushCommand(context);
    expect(host.command).toHaveBeenCalledWith('clean', context.settings.tipId, '#123456', expect.anything());
    expect(host.begin).not.toHaveBeenCalled();
  } finally { host.release(); }
});

/** A tiny host without Paint, DOM, workers, or a GPU. Documents/history are deliberately opaque strings. */
function createHost() {
  const preset = prepareAbrBrush({ id: 'round', name: 'Round', type: 'computed', settings: {},
    diameter: 16, spacing: 25, hardness: 100 });
  const cache = createBrushResources();
  preset.resources.forEach(resource => cache.put(resource));
  const resources = cache.open();
  const begin = vi.fn(), cancel = vi.fn(), command = vi.fn();
  const dabs: Dab[] = [];
  const context: AbrStrokeContext<string, string, AbrBrushInput> = {
    settings: abrBrushSettings.parse({ ...preset.engine.settings, seed: 1 }),
    resources, layer: 'opaque-layer',
    brush: { size: 16, color: '#123456', flow: 1, opacity: 1, mixing: 'linear', stroke: { mode: 'none' } },
    processor: { add: points => [...points], preview: () => [], finish: () => [] },
    renderer: { begin, cancel, mixerCommand: command, preview: vi.fn(),
      paint: async batch => { dabs.push(...batch); }, finish: async () => ['host-owned-change'],
      readCommittedPixel: async () => new Uint8Array(4), loadMixerFromCanvas: async () => {} }
  };
  return { context, begin, cancel, command, dabs, release: () => { resources.release(); cache.dispose(); } };
}
