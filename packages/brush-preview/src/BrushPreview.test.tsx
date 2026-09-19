import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr } from '@app-game/abr-parser';
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
