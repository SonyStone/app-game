import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import type { PaintEvent, PaintRuntimeCommand } from '@app-game/paint-core/protocol';
import { BrushPreview } from './BrushPreview';

await initAbr();

const mock = vi.hoisted(() => ({
  post: undefined as ((event: PaintEvent) => void) | undefined,
  input: undefined as Parameters<typeof import('@app-game/paint-core/input').attachInput>[1] | undefined,
  autoUpload: true,
  detach: vi.fn(), terminate: vi.fn(), send: vi.fn()
}));
vi.mock('@app-game/paint-core/input', () => ({ attachInput: (_canvas: unknown, options: typeof mock.input) => {
  mock.input = options;
  return mock.detach;
} }));
vi.mock('@app-game/paint-core/composition/PaintApplication', () => ({
  BrushEngines: () => null, BrushResources: () => null, Document: () => null, PaintRuntime: () => null,
  Renderer: () => null, Storage: () => null, StrokeProcessor: () => null,
  createPaintApplication: (_recipe: unknown, post: typeof mock.post) => {
    mock.post = post;
    return { terminate: mock.terminate, send: (command: PaintRuntimeCommand) => {
      mock.send(command);
      if (command.type === 'init') queueMicrotask(() => post!({ type: 'ready' }));
      if (mock.autoUpload && command.type === 'brush-resources') queueMicrotask(() => post!({ type: 'brush-resources', requestId: command.requestId,
        result: { ok: true, value: { evicted: [], stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } } }));
    } };
  }
}));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
afterEach(() => { mock.autoUpload = true; vi.clearAllMocks(); document.body.replaceChildren(); });

it('reuses resources across color changes, swaps presets and disposes input and runtime', async () => {
  const a = preset('A'), b = preset('B');
  const host = document.createElement('div'); document.body.append(host);
  let select!: (value: typeof a) => void, color!: (value: string) => void;
  const dispose = render(() => {
    const [selected, setSelected] = createSignal(a, { ownedWrite: true }); select = setSelected;
    const [value, setValue] = createSignal('#123456', { ownedWrite: true }); color = setValue;
    return <BrushPreview preset={selected()} color={value()} />;
  }, host);
  try {
    await vi.waitFor(() => { flush(); expect(mock.input?.ready()).toBe(true); });
    expect(mock.input?.brush().color).toBe('#123456');
    const uploads = () => mock.send.mock.calls.filter(([command]) => command.type === 'brush-resources').length;
    expect(uploads()).toBe(1);
    color('#abcdef'); flush();
    expect(mock.input?.brush().color).toBe('#abcdef'); expect(uploads()).toBe(1);
    select(b); flush();
    await vi.waitFor(() => { flush(); expect(mock.input?.brush().engine).toEqual(b.engine); });
    expect(uploads()).toBe(2);
    select(a); flush();
    await vi.waitFor(() => { flush(); expect(mock.input?.brush().engine).toEqual(a.engine); });
    expect(uploads()).toBe(2);
  } finally { dispose(); }
  expect(mock.detach).toHaveBeenCalledOnce();
  expect(mock.terminate).toHaveBeenCalledOnce();
});

function preset(name: string) {
  return prepareAbrBrush({
    id: name,
    name,
    preset: { kind: 'brush', sourceId: name, tip: { kind: 'computed' } },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  });
}

it('disposes during an upload without publishing a late brush or status', async () => {
  mock.autoUpload = false;
  const host = document.createElement('div'); document.body.append(host);
  const status = vi.fn();
  const dispose = render(() => <BrushPreview preset={preset('Pending')} onStatus={status} />, host);
  await vi.waitFor(() => { flush(); expect(mock.send.mock.calls.some(([command]) => command.type === 'brush-resources')).toBe(true); });
  const command = mock.send.mock.calls.find(([command]) => command.type === 'brush-resources')![0];
  dispose();
  mock.post!({ type: 'brush-resources', requestId: command.requestId,
    result: { ok: true, value: { evicted: [], stats: { bytes: 1, entries: 1, pinnedBytes: 0 } } } });
  await Promise.resolve(); flush();
  expect(mock.input?.ready()).toBe(false);
  expect(status).not.toHaveBeenCalledWith('Ready');
  expect(mock.detach).toHaveBeenCalledOnce();
  expect(mock.terminate).toHaveBeenCalledOnce();
});

it('draws with a brush and its resources and maps pen pressure through the host curve', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const brush = { ...defaultBrush(), color: '#202020' };
  const resource = { id: 'tip', width: 1, height: 1, format: 'r8unorm' as const, pixels: new Uint8Array(1) };
  const dispose = render(() => <BrushPreview brush={brush} resources={[resource]} mapPressure={(raw) => raw / 2} />, host);
  try {
    await vi.waitFor(() => { flush(); expect(mock.input?.ready()).toBe(true); });
    expect(mock.input?.brush()).toMatchObject({ color: '#202020', size: brush.size });
    expect(mock.send.mock.calls.filter(([command]) => command.type === 'brush-resources')).toHaveLength(1);
    mock.input!.send({ type: 'begin', brush: mock.input!.brush(), samples: [pen(0.8), { ...pen(0.8), pointerType: 'mouse', pressure: 1 }] });
    expect(sent().at(-1)).toMatchObject({ type: 'begin', samples: [{ pressure: 0.4 }, { pressure: 1 }] });
  } finally { dispose(); }
});

it('keeps raw strokes and draws them again on a fresh layer whenever the pressure mapping changes', async () => {
  const host = document.createElement('div'); document.body.append(host);
  let setHalf!: (value: boolean) => void;
  const dispose = render(() => {
    const [half, set] = createSignal(true, { ownedWrite: true }); setHalf = set;
    return <BrushPreview brush={defaultBrush()} redraw mapPressure={half() ? (raw) => raw / 2 : (raw) => raw} />;
  }, host);
  try {
    await vi.waitFor(() => { flush(); expect(sent().some((command) => command.type === 'layer')).toBe(true); });
    // Until the engine reports the strokes' layer, nothing draws.
    expect(mock.input?.ready()).toBe(false);
    state('background', 1); state('strokes', 2);
    await vi.waitFor(() => { flush(); expect(mock.input?.ready()).toBe(true); });
    mock.input!.send({ type: 'begin', brush: mock.input!.brush(), samples: [pen(0.6)] });
    mock.input!.send({ type: 'samples', samples: [pen(0.8)] });
    mock.input!.send({ type: 'end' });
    mock.send.mockClear();

    setHalf(false); flush();
    // The new layer comes first; its strokes wait for its id, then fill it while transparent and replace the old.
    expect(sent()).toEqual([{ type: 'layer', action: { type: 'add' } }]);
    expect(mock.input?.ready()).toBe(false);
    state('strokes', 2); state('staged', 3);
    expect(sent().map((command) => command.type === 'layer' ? command.action : command.type)).toEqual([
      { type: 'add' },
      { type: 'update', id: 'staged', patch: { opacity: 0 } },
      'begin', 'samples', 'end',
      { type: 'update', id: 'staged', patch: { opacity: 1 } },
      { type: 'delete', id: 'strokes' }
    ]);
    expect(sent()[2]).toMatchObject({ samples: [{ pressure: 0.6 }] });
    expect(sent()[3]).toMatchObject({ samples: [{ pressure: 0.8 }] });
    expect(mock.input?.ready()).toBe(true);

    // Changes while a redraw waits for its layer run once, after it.
    mock.send.mockClear();
    setHalf(true); flush();
    setHalf(false); flush();
    setHalf(true); flush();
    expect(sent()).toEqual([{ type: 'layer', action: { type: 'add' } }]);
    state('staged', 3); state('third', 3);
    expect(sent().filter((command) => command.type === 'layer').at(-1)).toEqual(
      { type: 'layer', action: { type: 'delete', id: 'staged' } });
    expect(sent().find((command) => command.type === 'samples')).toMatchObject({ samples: [{ pressure: 0.4 }] });
    expect(sent().filter((command) => command.type === 'layer' && command.action.type === 'add')).toHaveLength(1);
  } finally { dispose(); }
});

function sent(): PaintRuntimeCommand[] {
  return mock.send.mock.calls.map(([command]) => command);
}

function pen(pressure: number) {
  return { x: 1, y: 2, pressure, time: 0, pointerType: 'pen' };
}

/** An engine state whose active layer is `activeId`, among `count` layers. */
function state(activeId: string, count: number) {
  mock.post!({ type: 'state', document: { activeId, layers: Array(count).fill({}) } } as unknown as PaintEvent);
}
