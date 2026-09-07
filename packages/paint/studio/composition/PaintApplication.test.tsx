import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import type { PaintEvent } from '../protocol';
import { createRawProcessor } from '../strokeProcessors';
import { createBrushResources } from './brushResources';
import { CanvasTarget } from './CanvasTarget';
import type { BrushEngine, PaintRenderer } from './contracts';
import { defineBrushEngine } from './defineBrushEngine';
import { createMemoryStorage } from './memoryStorage';
import {
  BrushEngines,
  BrushResources,
  createPaintApplication,
  Document,
  PaintRuntime,
  Renderer,
  Storage,
  StrokeProcessor,
  type RuntimeBinding
} from './PaintApplication';

const cleanup: (() => void)[] = [];
afterEach(async () => {
  cleanup.splice(0).forEach((dispose) => dispose());
  await new Promise((resolve) => setTimeout(resolve, 10));
});

it('uses the JSX recipe and captures the selected processor/engine until stroke completion', async () => {
  let selected = 'first';
  const first = engine(),
    second = engine();
  const firstProcessor = vi.fn(createRawProcessor),
    secondProcessor = vi.fn(createRawProcessor);
  const setup = mount({
    engines: { first, second },
    selectEngine: () => selected,
    processors: { first: firstProcessor, second: secondProcessor },
    selectProcessor: () => selected
  });
  await setup.ready();
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [{ x: 0, y: 0, pressure: 0.5, time: 1 }] });
  await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
  selected = 'second';
  setup.runtime.send({ type: 'samples', samples: [{ x: 10, y: 0, pressure: 0.5, time: 2 }] });
  setup.runtime.send({ type: 'end' });
  await vi.waitFor(() => expect(first.mock.results[0]!.value.finish).toHaveBeenCalledOnce());
  expect(second).not.toHaveBeenCalled();
  expect(firstProcessor).toHaveBeenCalledOnce();
  expect(first.mock.results[0]!.value.add).toHaveBeenCalledTimes(2);
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  setup.runtime.send({ type: 'end' });
  await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
  expect(secondProcessor).toHaveBeenCalledOnce();
  expect(setup.events.filter((e) => e.type === 'error')).toEqual([]);
});

it('routes explicit presets through the JSX registry and rejects invalid settings without dirtying the document', async () => {
  const create = engine();
  const custom = defineBrushEngine({
    id: 'custom',
    parse: (input) => z.object({ tipId: z.string() }).parse(input),
    create
  });
  const setup = mount({ engines: { custom: custom.engine }, selectEngine: () => 'not-the-selected-engine' });
  await setup.ready();
  setup.runtime.send({
    type: 'begin',
    brush: { ...defaultBrush(), engine: { id: 'custom', settings: { tipId: 12 } } },
    samples: []
  });
  await vi.waitFor(() => expect(setup.events.some((event) => event.type === 'error')).toBe(true));
  expect(create).not.toHaveBeenCalled();
  setup.runtime.send({ type: 'debug', enabled: true });
  await vi.waitFor(() => expect(setup.events.at(-1)).toMatchObject({ type: 'state', saved: true }));
  setup.runtime.send({
    type: 'begin',
    brush: { ...defaultBrush(), engine: custom.select({ tipId: 'tip-123' }) },
    samples: []
  });
  setup.runtime.send({ type: 'end' });
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(create.mock.calls[0]![0].settings).toEqual({ tipId: 'tip-123' });
});

it('uploads resources once, pins them through repeated strokes and reports misses without dirtying', async () => {
  const used: Uint8Array[] = [];
  const custom: BrushEngine = ({ resources, ...context }) => {
    used.push(resources.get('tip-v1').pixels);
    return engine()({ resources, ...context });
  };
  const setup = mount({ engines: { test: custom } });
  await setup.ready();
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() => expect(setup.events.some((e) => e.type === 'error')).toBe(true));
  setup.runtime.send({ type: 'debug', enabled: true });
  await vi.waitFor(() => expect(setup.events.at(-1)).toMatchObject({ type: 'state', saved: true }));
  setup.runtime.send({
    type: 'brush-resources',
    requestId: 'load',
    action: 'put',
    resource: { id: 'tip-v1', width: 2, height: 2, format: 'r8unorm', pixels: new Uint8Array([1, 2, 3, 4]) }
  });
  await vi.waitFor(() =>
    expect(setup.events).toContainEqual({
      type: 'brush-resources',
      requestId: 'load',
      result: { ok: true, value: { evicted: [], stats: { bytes: 4, entries: 1, pinnedBytes: 0 } } }
    })
  );
  for (let i = 0; i < 2; i++) {
    setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
    await vi.waitFor(() => expect(used).toHaveLength(i + 1));
    expect(setup.resources.stats().pinnedBytes).toBe(4);
    setup.runtime.send({ type: 'brush-resources', requestId: `remove-${i}`, action: 'delete', id: 'tip-v1' });
    await vi.waitFor(() =>
      expect(setup.events).toContainEqual(
        expect.objectContaining({
          type: 'brush-resources',
          requestId: `remove-${i}`,
          result: expect.objectContaining({ ok: false })
        })
      )
    );
    setup.runtime.send({ type: i === 0 ? 'end' : 'cancel' });
    await vi.waitFor(() => expect(setup.resources.stats().pinnedBytes).toBe(0));
  }
  expect(used[0]).toBe(used[1]);
  setup.runtime.terminate();
  await vi.waitFor(() => expect(setup.resources.stats().bytes).toBe(0));
});

it('releases a failed input session immediately and accepts the next stroke', async () => {
  const failing = engine();
  let shouldFail = true;
  const setup = mount({
    engines: {
      test: (context) => {
        context.resources.get('tip');
        const session = failing(context);
        vi.mocked(session.add).mockImplementation(async () => {
          if (shouldFail) throw new Error('input failed');
        });
        return session;
      }
    }
  });
  await setup.ready();
  setup.resources.put({ id: 'tip', format: 'r8unorm', width: 1, height: 1, pixels: new Uint8Array([255]) });
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() =>
    expect(setup.events).toContainEqual(expect.objectContaining({ type: 'error', message: 'input failed' }))
  );
  expect(setup.resources.stats().pinnedBytes).toBe(0);
  expect(failing.mock.results[0]!.value.cancel).toHaveBeenCalledOnce();
  shouldFail = false;
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(2));
  expect(setup.resources.stats().pinnedBytes).toBe(1);
  setup.runtime.terminate();
  await vi.waitFor(() => expect(setup.resources.stats().bytes).toBe(0));
  expect(failing.mock.results[1]!.value.cancel).toHaveBeenCalledOnce();
});

it('drops the resource session when a live-tail toggle fails', async () => {
  let rejectPreview = false;
  const create = engine();
  const setup = mount({
    engines: {
      test: (context) => {
        context.resources.get('tip');
        const session = create(context);
        vi.mocked(session.preview).mockImplementation(() => {
          if (rejectPreview) throw new Error('preview failed');
        });
        return session;
      }
    }
  });
  await setup.ready();
  setup.resources.put({ id: 'tip', format: 'r8unorm', width: 1, height: 1, pixels: new Uint8Array([255]) });
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  rejectPreview = true;
  setup.runtime.send({ type: 'live-tail', enabled: false });
  await vi.waitFor(() =>
    expect(setup.events).toContainEqual(expect.objectContaining({ type: 'error', message: 'preview failed' }))
  );
  expect(setup.resources.stats().pinnedBytes).toBe(0);
  rejectPreview = false;
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  setup.runtime.send({ type: 'end' });
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(setup.events.filter((e) => e.type === 'error')).toHaveLength(1);
});

it('reactively replaces and removes targets on one renderer without recreating the document', async () => {
  const first = document.createElement('canvas'),
    replacement = document.createElement('canvas');
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>(first);
  const [size, setSize] = createSignal({ width: 80, height: 60 });
  const setup = mount({}, () => (
    <CanvasTarget id="preview" canvas={canvas()} camera={defaultCamera()} size={size()} dpr={1} />
  ));
  await setup.ready();
  await vi.waitFor(() =>
    expect(setup.renderer.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { width: 80, height: 60 },
      1,
      false,
      first
    )
  );
  setCanvas(replacement);
  setSize({ width: 120, height: 100 });
  flush();
  await vi.waitFor(() => expect(setup.renderer.releaseTarget).toHaveBeenCalledWith(first));
  await vi.waitFor(() =>
    expect(setup.renderer.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { width: 120, height: 100 },
      1,
      false,
      replacement
    )
  );
  setCanvas(undefined);
  flush();
  await vi.waitFor(() => expect(setup.renderer.releaseTarget).toHaveBeenCalledWith(replacement));
  expect(setup.createRenderer).toHaveBeenCalledOnce();
  expect(setup.events.filter((e) => e.type === 'error')).toEqual([]);
});

it('defers replacing the primary canvas until an in-flight render finishes', async () => {
  const first = document.createElement('canvas'),
    replacement = document.createElement('canvas');
  const [canvas, setCanvas] = createSignal(first);
  const setup = mount({}, () => (
    <CanvasTarget id="main" canvas={canvas()} camera={defaultCamera()} size={{ width: 100, height: 100 }} dpr={1} />
  ));
  await setup.ready();
  await vi.waitFor(() =>
    expect(setup.renderer.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { width: 100, height: 100 },
      1,
      false,
      first
    )
  );
  vi.mocked(setup.renderer.releaseTarget).mockClear();
  let release!: () => void;
  const busy = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  vi.mocked(setup.renderer.render).mockImplementationOnce(async () => {
    started = true;
    await busy;
  });
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() => expect(started).toBe(true));
  setCanvas(replacement);
  flush();
  try {
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setup.renderer.releaseTarget).not.toHaveBeenCalled();
  } finally {
    release();
  }
  await vi.waitFor(() => expect(setup.renderer.releaseTarget).toHaveBeenCalledWith(first));
  await vi.waitFor(() =>
    expect(setup.renderer.render).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { width: 100, height: 100 },
      1,
      false,
      replacement
    )
  );
  expect(setup.createRenderer).toHaveBeenCalledOnce();
  expect(setup.events.filter((event) => event.type === 'error')).toEqual([]);
});

it('saves camera changes supplied by the reactive primary target', async () => {
  const canvas = document.createElement('canvas');
  const [camera, setCamera] = createSignal(defaultCamera());
  const setup = mount({}, () => (
    <CanvasTarget id="main" canvas={canvas} camera={camera()} size={{ width: 100, height: 100 }} dpr={1} />
  ));
  await setup.ready();
  setCamera({ ...defaultCamera(), x: 123, zoom: 0.5 });
  flush();
  setup.runtime.send({ type: 'checkpoint' });
  await vi.waitFor(() => expect(setup.events).toContainEqual({ type: 'checkpointed' }));
  expect((await (await setup.storage('paint-studio')).load())!.camera).toMatchObject({ x: 123, zoom: 0.5 });
});

it('reports an unregistered engine before touching the renderer', async () => {
  const setup = mount({ selectEngine: () => 'missing' });
  await setup.ready();
  setup.runtime.send({ type: 'begin', brush: defaultBrush(), samples: [] });
  await vi.waitFor(() =>
    expect(setup.events).toContainEqual(
      expect.objectContaining({ type: 'error', message: 'Brush engine "missing" is not registered.' })
    )
  );
  expect(setup.renderer.begin).not.toHaveBeenCalled();
});

function engine() {
  return vi.fn<BrushEngine>(({ processor }) => ({
    add: vi.fn(async (samples) => {
      processor.add(samples);
    }),
    preview: vi.fn(),
    finish: vi.fn(async () => []),
    cancel: vi.fn()
  }));
}

function mount(
  overrides: Partial<Parameters<typeof BrushEngines>[0] & Parameters<typeof StrokeProcessor>[0]> = {},
  children?: () => import('solid-js').Element
) {
  const renderer = {
    stats: () => ({}),
    debugTiles: () => [],
    debugPages: () => [],
    render: vi.fn(async () => {}),
    submitted: async () => {},
    begin: vi.fn(),
    releaseTarget: vi.fn(),
    destroy: vi.fn(),
    reset: vi.fn(),
    setSelection: vi.fn(),
    prepareOverview: async () => {}
  } as unknown as PaintRenderer;
  const createRenderer = vi.fn(async () => renderer);
  const storage = createMemoryStorage();
  const resources = createBrushResources({ maxBytes: 8 });
  const events: PaintEvent[] = [];
  const recipe = (binding: RuntimeBinding) => (
    <Document document={() => createDocument({ paged: true })}>
      <Storage storage={storage}>
        <Renderer renderer={createRenderer}>
          <StrokeProcessor
            processors={overrides.processors ?? { none: createRawProcessor }}
            selectProcessor={overrides.selectProcessor ?? (() => 'none')}
          >
            <BrushEngines
              engines={overrides.engines ?? { test: engine() }}
              selectEngine={overrides.selectEngine ?? (() => 'test')}
            >
              <BrushResources resources={() => resources}>
                <PaintRuntime {...binding}>{children?.()}</PaintRuntime>
              </BrushResources>
            </BrushEngines>
          </StrokeProcessor>
        </Renderer>
      </Storage>
    </Document>
  );
  const runtime = createPaintApplication(
    recipe,
    (event) => events.push(event),
    () => {}
  );
  cleanup.push(runtime.terminate);
  runtime.send({ type: 'init', canvas: document.createElement('canvas'), size: { width: 256, height: 256 }, dpr: 1 });
  flush();
  return {
    runtime,
    renderer,
    createRenderer,
    storage,
    resources,
    events,
    ready: () => vi.waitFor(() => expect(events).toContainEqual({ type: 'ready' }))
  };
}
