import { beforeEach, expect, it, vi } from 'vitest';
import type { TgpuRoot } from 'typegpu';
import type { Dab } from '../input';
import { createAbrRetouch, type AbrRetouchHost, type AbrRetouchSettings } from './retouch';

const mocks = vi.hoisted(() => ({
  smudge: { step: vi.fn(), reset: vi.fn(), destroy: vi.fn(), bytes: () => 20 },
  mixer: {
    begin: vi.fn(), step: vi.fn(), finish: vi.fn(), cancel: vi.fn(), command: vi.fn(),
    snapshot: vi.fn(), restore: vi.fn(), loadCanvas: vi.fn(), destroy: vi.fn(), bytes: 30
  },
  filter: { render: vi.fn(), destroy: vi.fn(), bytes: () => 40 },
  createSmudge: vi.fn(), createMixer: vi.fn(), createFilter: vi.fn()
}));
vi.mock('./smudgePickup', () => ({ createSmudgePickup: mocks.createSmudge }));
vi.mock('./mixerWells', () => ({ createMixerWells: mocks.createMixer }));
vi.mock('./canvasFilter', () => ({ createCanvasFilter: mocks.createFilter }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSmudge.mockReturnValue(mocks.smudge);
  mocks.createMixer.mockReturnValue(mocks.mixer);
  mocks.createFilter.mockReturnValue(mocks.filter);
  mocks.smudge.step.mockImplementation(patch => patch);
  mocks.mixer.step.mockImplementation(patch => patch);
});

it('borrows host layers and preserves pickup/deposit order across input batches', async () => {
  const h = harness();
  h.retouch.begin(settings({ smudge: { strength: 0.9, fingerPainting: false, layers: [layer], allLayers: true } }), '#ff0000', true);
  await h.retouch.paint([dab(10)]);
  expect(h.deposit).not.toHaveBeenCalled(); // First contact loads paint without making a mark.
  await h.retouch.paint([secondary(20)]);
  await h.retouch.paint([dab(30), dab(40)]);
  expect(h.deposit.mock.calls.map(([dabs]) => dabs.map(d => d.x))).toEqual([[20, 30], [40]]);
  expect(h.events.filter(e => /capture|deposit/.test(e))).toEqual(['capture', 'capture', 'deposit', 'capture', 'deposit']);
  expect(h.capture.mock.calls.every(([, layers, allLayers]) => layers[0] === layer && allLayers)).toBe(true);
  expect(h.capture.mock.calls.every(([, , , , linear]) => linear)).toBe(true);
  expect(h.events.at(-1)).toBe('progress');
  expect(h.events.lastIndexOf('submit')).toBeLessThan(h.events.lastIndexOf('progress'));

  h.retouch.cancel();
  expect(h.retouch.active).toBe(false);
  h.deposit.mockClear();
  h.retouch.begin(settings({ smudge: { strength: 0.9, fingerPainting: false, layers: [layer], allLayers: false } }), '#ff0000', true);
  await h.retouch.paint([dab(50)]);
  expect(h.deposit).not.toHaveBeenCalled(); // A new stroke must not inherit carried paint.
});

it('submits borrowed GPU work even when a destination fails, without reporting progress', async () => {
  const h = harness();
  h.retouch.begin(settings({ smudge: { strength: 0.5, fingerPainting: true, layers: [layer], allLayers: false } }), '#ff0000', true);
  h.deposit.mockRejectedValueOnce(new Error('tile unavailable'));
  await expect(h.retouch.paint([dab(20)])).rejects.toThrow('tile unavailable');
  expect(h.events).toEqual(['capture', 'submit']);
  expect(h.progress).not.toHaveBeenCalled();
  expect(mocks.smudge.step.mock.calls[0]![3]).toEqual([1, 0, 0]);
});

it('retains Classic sampling and avoids any GPU work for zero-strength tools', async () => {
  const h = harness();
  const preset = settings({ mixing: 'classic', smudge: { strength: 0, fingerPainting: false, layers: [layer], allLayers: false } });
  h.retouch.begin(preset, '#000000', true);
  await h.retouch.paint([dab(0), dab(10)]);
  expect(h.capture).not.toHaveBeenCalled();
  expect(mocks.createSmudge).not.toHaveBeenCalled();
  h.retouch.cancel();
  h.retouch.begin({ ...preset, smudge: { ...preset.smudge!, strength: 0.9 } }, '#000000', true);
  await h.retouch.paint([dab(0), dab(10)]);
  expect(h.capture.mock.calls.every(([, , , , linear]) => linear === false)).toBe(true);
});

it('retains Mixer reservoirs between gestures, commits and cancels them separately', async () => {
  const h = harness();
  const preset = settings({ mixer: { key: 'wet', wet: 0.5, load: 1, mix: 0.6, autoFill: false, autoClean: false, layers: [layer], allLayers: false } });
  h.retouch.begin(preset, '#ff0000', false);
  await h.retouch.paint([dab(0), dab(20)]);
  expect(mocks.mixer.step.mock.calls.map(args => args[4])).toEqual([0, 1]);
  h.retouch.finish();
  expect(mocks.mixer.finish).toHaveBeenCalledTimes(1);
  h.retouch.begin(preset, '#ff0000', false);
  await h.retouch.paint([dab(40)]);
  h.retouch.cancel();
  expect(mocks.mixer.cancel).toHaveBeenCalledTimes(1);
  expect(mocks.createMixer).toHaveBeenCalledTimes(1);
  expect(h.retouch.bytes()).toBe(30);
  h.retouch.destroy();
  expect(mocks.mixer.destroy).toHaveBeenCalledTimes(1);
  expect(h.retouch.bytes()).toBe(0);
});

it('uses only host-approved filter destinations and releases captured outputs on failure', async () => {
  const h = harness();
  const releases: ReturnType<typeof vi.fn>[] = [];
  mocks.filter.render.mockImplementation(patch => {
    const release = vi.fn();
    releases.push(release);
    return { ...patch, release };
  });
  h.retouch.begin(settings({ filter: { strength: 0.5, sharpen: true, protectDetail: true, layers: [layer], allLayers: false } }), '#000000', false);
  h.deposit.mockRejectedValueOnce(new Error('write failed'));
  await expect(h.retouch.paint([dab(0)])).rejects.toThrow('write failed');
  expect(h.capture).toHaveBeenCalledTimes(2); // Both adjacent source halos captured before either is overwritten.
  expect(h.events.slice(0, 2)).toEqual(['capture', 'capture']);
  expect(h.deposit.mock.calls[0]![2]).toBe('0,0');
  expect(releases).toHaveLength(2);
  expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
  expect(mocks.filter.render.mock.calls.every(args => args.slice(1).every(Boolean))).toBe(true);
});

it('rejects invalid tool snapshots and load sizes before changing reservoirs or capturing canvas pixels', async () => {
  const h = harness();
  expect(() => h.retouch.restore({ version: 999 })).toThrow();
  await expect(h.retouch.loadMixerFromCanvas({
    key: 'wet', color: '#000000', point: { x: 0, y: 0 }, size: Infinity, layers: [layer],
    allLayers: false, solid: true, autoFill: false, autoClean: false, load: 1
  })).rejects.toThrow('size');
  expect(mocks.createMixer).not.toHaveBeenCalled();
  expect(h.capture).not.toHaveBeenCalled();
});

const layer = { id: 'opaque-host-layer', visible: true, opacity: 1, blend: 'normal' };
function settings(overrides: Partial<AbrRetouchSettings<typeof layer>>): AbrRetouchSettings<typeof layer> {
  return { mixing: 'linear', ...overrides };
}
function dab(x: number): Dab { return { x, y: 10, radius: 10, flow: 1 }; }
function secondary(x: number): Dab { return { ...dab(x), abr: { data: new Float32Array(16), secondary: true } }; }

/** GPU kernels are tested on-device; this host records ordering and resource ownership without a browser. */
function harness() {
  const events: string[] = [];
  const root = { device: {
    createCommandEncoder: () => ({ finish: () => ({}) }),
    queue: { submit: () => { events.push('submit'); } }
  } } as unknown as TgpuRoot;
  const capture = vi.fn<AbrRetouchHost<typeof layer>['capture']>(async (region, _layers, _all, _exact, _linear, batch) => {
    events.push('capture');
    batch?.encoder();
    return { texture: {} as Awaited<ReturnType<AbrRetouchHost<typeof layer>['capture']>>['texture'], width: 20, height: 20, region };
  });
  const deposit = vi.fn<AbrRetouchHost<typeof layer>['deposit']>(async () => { events.push('deposit'); });
  const progress = vi.fn(async () => { events.push('progress'); });
  const retouch = createAbrRetouch(root, { capture, deposit, tileKeys: () => ['0,0', '1,0'] }, { onPaintProgress: progress });
  return { retouch, capture, deposit, progress, events };
}
