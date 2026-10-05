import { percent, pixels } from '@app-game/abr-parser';
import { expect, it, vi } from 'vitest';
import type { AbrBrushInput, AbrStrokeContext } from './contracts';
import { abrBrushSettings, createAbrStroke, runAbrBrushCommand } from './index';
import type { Dab } from './input';
import { prepareAbrBrush } from './preset';
import { createBrushResources } from './resources';

it('runs with opaque host layer/history types, preserving stroke order and committed changes', async () => {
  const host = createHost();
  const stroke = createAbrStroke(host.context);
  try {
    await stroke.add([
      { x: 1, y: 2, pressure: 1, time: 0 },
      { x: 101, y: 2, pressure: 1, time: 100 }
    ]);
    expect(host.dabs.length).toBeGreaterThan(1);
    expect(host.dabs[0]!.x).toBe(1);
    expect(host.dabs.at(-1)!.x).toBeGreaterThan(95);
    stroke.preview(true);
    expect(await stroke.finish()).toEqual(['host-owned-change']);
    expect(host.begin).toHaveBeenCalledWith(
      host.context.layer,
      host.context.brush,
      undefined,
      expect.objectContaining({ tip: expect.objectContaining({ id: host.context.settings.tipId }) })
    );
  } finally {
    host.release();
  }
});

it('rejects missing resources before starting GPU state and cancels through the host', () => {
  const host = createHost();
  try {
    expect(() =>
      createAbrStroke({ ...host.context, settings: { ...host.context.settings, tipId: 'missing' } })
    ).toThrow('not loaded');
    expect(host.begin).not.toHaveBeenCalled();
    createAbrStroke(host.context).cancel();
    expect(host.cancel).toHaveBeenCalledOnce();
  } finally {
    host.release();
  }
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
  } finally {
    host.release();
  }
});

it('Pencil Auto Erase swaps to the background color when the first contact is foreground', async () => {
  for (const [pixel, expected] of [
    [[0x12, 0x34, 0x56, 255], [1, 1, 1]],
    [[0, 0, 0, 0], [0x12 / 255, 0x34 / 255, 0x56 / 255]]
  ] as const) {
    const host = createHost({ kind: 'PcTl', autoErase: true }, new Uint8Array(pixel));
    try {
      const stroke = createAbrStroke({ ...host.context, brush: { ...host.context.brush, backgroundColor: '#ffffff' } });
      await stroke.add([{ x: 1, y: 2, pressure: 1, time: 0 }]);
      const color = [...host.dabs[0]!.abr!.data.subarray(12, 15)];
      color.forEach((channel, i) => expect(channel).toBeCloseTo(expected[i]!, 5));
    } finally {
      host.release();
    }
  }
});

it('reuses the Block Eraser tip resource across strokes', () => {
  const host = createHost({ kind: 'ErTl', eraserMode: 3 });
  try {
    const tips = [0, 1].map(() => {
      createAbrStroke(host.context).cancel();
      return host.begin.mock.calls.at(-1)![3].tip;
    });
    expect(tips[0].id).toBe('block-eraser-square');
    expect(tips[1]).toBe(tips[0]);
  } finally {
    host.release();
  }
});

/** A tiny host without Paint, DOM, workers, or a GPU. Documents/history are deliberately opaque strings. */
function createHost(toolOptions?: { kind: string } & Record<string, unknown>, pixel = new Uint8Array(4)) {
  const preset = prepareAbrBrush({
    id: 'round',
    name: 'Round',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...(toolOptions ? { toolOptions } : {}),
      tip: { kind: 'computed', diameter: pixels(16), spacing: percent(25), hardness: percent(100) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  const cache = createBrushResources();
  preset.resources.forEach((resource) => cache.put(resource));
  const resources = cache.open();
  const begin = vi.fn(),
    cancel = vi.fn(),
    command = vi.fn();
  const dabs: Dab[] = [];
  const context: AbrStrokeContext<string, string, AbrBrushInput> = {
    settings: abrBrushSettings.parse({ ...preset.engine.settings, seed: 1 }),
    resources,
    layer: 'opaque-layer',
    brush: { size: 16, color: '#123456', flow: 1, opacity: 1, mixing: 'linear', stroke: { mode: 'none' } },
    processor: { add: (points) => [...points], preview: () => [], finish: () => [] },
    renderer: {
      begin,
      cancel,
      mixerCommand: command,
      preview: vi.fn(),
      paint: async (batch) => {
        dabs.push(...batch);
      },
      finish: async () => ['host-owned-change'],
      readCommittedPixel: async () => pixel,
      loadMixerFromCanvas: async () => {}
    }
  };
  return {
    context,
    begin,
    cancel,
    command,
    dabs,
    release: () => {
      resources.release();
      cache.dispose();
    }
  };
}
