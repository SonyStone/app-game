import { render, type JSX } from '@solidjs/web';
import { createEffect, createRoot, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { gpuError } from '../../shared/errors';
import { serializeGpuPreparation } from '../../shared/gpu/serializeGpuPreparation';
import { createDocumentCamera, type DocumentCamera } from '../camera/createDocumentCamera';
import type { Viewport } from '../viewport/createViewport';
import { FrameLoop, useFrame, useFrameLoop } from './FrameLoop';
import { RenderLayer } from './RenderLayer';
import { ScreenSpace } from './SceneSpace';

const viewport = {
  size: () => ({ css: { width: 800, height: 600 }, pixels: { width: 800, height: 600 }, dpr: 1 }),
  clientToScreen: (point: { x: number; y: number }) => point,
  screenToClip: (point: { x: number; y: number }) => point
} as Viewport;

vi.mock('../../shared/gpu/GpuCanvasProvider', () => ({ useGpuCanvas: () => gpu }));

let abort: AbortController;
let gpu: ReturnType<typeof gpuFixture>['gpu'];
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const cleanups: (() => void)[] = [];

beforeEach(() => {
  abort = new AbortController();
  gpu = gpuFixture(abort.signal).gpu;
  frames.clear();

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

it('runs updates before drawing even if JSX mounts the drawing component first', async () => {
  const { calls, loop } = mount();

  loop.invalidate();
  loop.invalidate();
  expect(frames.size).toBe(1);

  await tick();
  expect(calls).toEqual(['update', 'draw']);
  expect(frames.size).toBe(0);
});

it('unsubscribes removed components and redraws the remaining scene once', async () => {
  const { calls, setDraw } = mount();
  await tick();
  calls.length = 0;

  setDraw(false);
  flush();
  await tick();

  expect(calls).toEqual(['update']);
  expect(frames.size).toBe(0);

  calls.length = 0;
  setDraw(true);
  flush();
  await tick();

  expect(calls).toEqual(['update', 'draw']);
  expect(frames.size).toBe(0);
});

it('stops synchronously on GPU cancellation and ignores subsequent invalidations', async () => {
  const { loop, calls } = mount();
  expect(frames.size).toBe(1);

  abort.abort();
  loop.invalidate();
  await tick();

  expect(frames.size).toBe(0);
  expect(calls).toEqual([]);
});

it('cancels scheduled callbacks when the JSX tree is disposed', async () => {
  const { dispose, loop, calls } = mount();
  dispose();
  loop.invalidate();
  await tick();

  expect(frames.size).toBe(0);
  expect(calls).toEqual([]);
});

it('resumes once after repeated same-turn pauses and resumes', async () => {
  const { loop, calls } = mount();

  for (let i = 0; i < 3; i++) {
    loop.setActive(false);
    expect(frames.size).toBe(0);
    loop.setActive(true);
    loop.invalidate();
    expect(frames.size).toBe(1);
  }

  flush();
  await tick();
  expect(calls).toEqual(['update', 'draw']);
  expect(frames.size).toBe(0);
});

it('cancels a same-turn restart when disposed', async () => {
  const { loop, dispose, calls } = mount();
  loop.setActive(false);
  loop.setActive(true);
  dispose();
  flush();
  await tick();
  expect(frames.size).toBe(0);
  expect(calls).toEqual([]);
});

it('preserves a new invalidation requested from a frame callback', async () => {
  const { calls } = mount(true);
  await tick();
  expect(frames.size).toBe(1);

  await tick();
  expect(calls).toEqual(['update', 'draw', 'update', 'draw']);
  expect(frames.size).toBe(0);
});

it('composes independently mounted layers, reacts to order and removes them without stopping siblings', async () => {
  const calls: string[] = [];
  const mounted = createRoot((disposeState) => {
    const [visible, setVisible] = createSignal(false);
    const [order, setOrder] = createSignal(-1);
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <RenderLayer
            draw={() => {
              calls.push('sibling');
            }}
          />
          <Show when={visible()}>
            <RenderLayer
              order={order()}
              draw={() => {
                calls.push('late');
              }}
            />
          </Show>
        </FrameLoop>
      ),
      document.createElement('div')
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setVisible, setOrder };
  });

  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['sibling']);

  mounted.setVisible(true);
  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['late', 'sibling']);

  mounted.setOrder(1);
  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['sibling', 'late']);

  mounted.setVisible(false);
  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['sibling']);
  expect(frames.size).toBe(0);
  expect(gpu.device.queue.submit).toHaveBeenCalledTimes(4);
});

it('mounts children once under the loop context and owns their subscriptions and cleanup', async () => {
  const cleanup = vi.fn();
  const callback = vi.fn();
  const onError = vi.fn();
  let loop!: ReturnType<typeof useFrameLoop>;
  let mounts = 0;

  function Scene(props: { visible: boolean }) {
    mounts++;
    loop = useFrameLoop();
    useFrame(callback, { phase: 'update' });
    onCleanup(cleanup);

    return (
      <Show when={props.visible}>
        <RenderLayer draw={() => {}} />
      </Show>
    );
  }

  const mounted = createRoot((disposeState) => {
    const [visible, setVisible] = createSignal(true);
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={onError}>
          <Scene visible={visible()} />
        </FrameLoop>
      ),
      document.createElement('div')
    );

    const dispose = () => {
      disposeView();
      disposeState();
    };

    cleanups.push(dispose);
    return { setVisible, dispose };
  });

  flush();
  await tick();
  expect(callback).toHaveBeenCalledOnce();

  mounted.setVisible(false);
  flush();
  await tick();
  expect(mounts).toBe(1);
  expect(cleanup).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledTimes(2);

  const error = gpuError('render', 'Cannot prepare document');
  loop.fail(error);
  loop.invalidate();
  await tick();
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  expect(frames.size).toBe(0);

  mounted.dispose();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledTimes(2);
});

it('follows JSX order for late siblings and keyed list reordering without recreating GPU owners', async () => {
  const calls: string[] = [];
  const mountedLayers: number[] = [];
  const disposedLayers: number[] = [];
  let documentCamera!: DocumentCamera;

  function Layer(props: { id: number }) {
    const { camera } = documentCamera;
    mountedLayers.push(props.id);
    onCleanup(() => disposedLayers.push(props.id));

    return (
      <RenderLayer
        draw={() => {
          calls.push(`${props.id}:${camera().zoom}`);
        }}
      />
    );
  }

  const mounted = createRoot((disposeState) => {
    const [early, setEarly] = createSignal(false);
    const [ids, setIds] = createSignal([1, 2]);
    documentCamera = createDocumentCamera({ pageAspect: () => 1 });
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <ScreenSpace>
            <Show when={early()}>
              <Layer id={0} />
            </Show>
            <For each={ids()}>{(id) => <Layer id={id} />}</For>
          </ScreenSpace>
        </FrameLoop>
      ),
      document.createElement('div')
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setEarly, setIds };
  });

  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['1:2', '2:2']);

  mounted.setEarly(true);
  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['0:2', '1:2', '2:2']);

  mounted.setIds([2, 1]);
  flush();
  await tick();
  expect(calls.splice(0)).toEqual(['0:2', '2:2', '1:2']);
  expect(mountedLayers).toEqual([1, 2, 0]);
  expect(disposedLayers).toEqual([]);

  mounted.setEarly(false);
  mounted.setIds([]);
  flush();
  await tick();
  expect(calls).toEqual([]);
  expect(disposedLayers.sort()).toEqual([0, 1, 2]);
  expect(gpu.device.queue.submit).toHaveBeenCalledTimes(4);
  expect(frames.size).toBe(0);
});

it('reacts to replacing a token draw prop without remounting the layer', async () => {
  const first = vi.fn();
  const second = vi.fn();
  const mounted = createRoot((disposeState) => {
    const [draw, setDraw] = createSignal(() => first);
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <RenderLayer draw={draw()} />
        </FrameLoop>
      ),
      document.createElement('div')
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });

    return { setDraw };
  });

  flush();
  await tick();
  expect(first).toHaveBeenCalledOnce();

  mounted.setDraw(() => second);
  flush();
  await tick();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);
});

it('keeps independent animations running until the last enabled owner unsubscribes', async () => {
  const a = vi.fn();
  const b = vi.fn();
  const mounted = createRoot((disposeState) => {
    const [enabledA, setA] = createSignal(true);
    const [enabledB, setB] = createSignal(true);
    const [mountedB, mountB] = createSignal(true);

    function AnimationA() {
      useFrame(a, { enabled: enabledA, continuous: true });
      return null;
    }

    function AnimationB() {
      useFrame(b, { enabled: enabledB, continuous: true });
      return null;
    }

    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <AnimationA />
          <Show when={mountedB()}>
            <AnimationB />
          </Show>
        </FrameLoop>
      ),
      document.createElement('div')
    );

    cleanups.push(() => {
      disposeView();
      disposeState();
    });
    return { setA, setB, mountB };
  });

  flush();
  await tick(1000);
  await tick(1016);
  expect(a.mock.calls[1]![0]).toMatchObject({ delta: 0.016, time: 0.016 });
  expect(frames.size).toBe(1);

  mounted.setA(false);
  flush();
  await tick(1032);
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(3);
  expect(frames.size).toBe(1);

  mounted.mountB(false);
  flush();
  await tick(1048);
  expect(b).toHaveBeenCalledTimes(3);
  expect(frames.size).toBe(0);

  mounted.setA(true);
  flush();
  await tick(5000);
  expect(a.mock.lastCall![0].delta).toBe(0);
  expect(frames.size).toBe(1);
});

it('pauses hidden pages, retains invalidation and resumes without advancing animation time', async () => {
  const callback = vi.fn();
  let loop!: ReturnType<typeof useFrameLoop>;
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

  function Animation() {
    loop = useFrameLoop();
    useFrame(callback, { continuous: true });
    return null;
  }

  const dispose = render(
    () => (
      <FrameLoop viewport={viewport} onError={vi.fn()}>
        <Animation />
      </FrameLoop>
    ),
    document.createElement('div')
  );
  cleanups.push(() => {
    dispose();
    visibility.mockRestore();
  });

  flush();
  await tick(1000);
  await tick(1020);

  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  loop.invalidate();
  expect(frames.size).toBe(0);
  expect(callback).toHaveBeenCalledTimes(2);

  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  await tick(10000);
  expect(callback.mock.lastCall![0]).toEqual({ timestamp: 10000, delta: 0, time: 0.02 });
  await tick(20000);
  expect(callback.mock.lastCall![0].delta).toBe(0.1);

  dispose();
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  expect(frames.size).toBe(0);
});

it('hides keyed layers without disposing resources and preserves owners when object identities change', async () => {
  const created: string[] = [];
  const disposed: string[] = [];
  const drawn: number[] = [];

  function Graphic(props: { id: string; value: number; visible: boolean }) {
    const id = untrack(() => props.id);
    created.push(id);
    onCleanup(() => disposed.push(id));
    return (
      <RenderLayer
        visible={props.visible}
        draw={() => {
          drawn.push(props.value);
        }}
      />
    );
  }

  const mounted = createRoot((disposeState) => {
    const [items, setItems] = createSignal([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 }
    ]);
    const [visible, setVisible] = createSignal(true);
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <For each={items()} keyed={(item) => item.id}>
            {(item) => <Graphic id={item().id} value={item().value} visible={visible()} />}
          </For>
        </FrameLoop>
      ),
      document.createElement('div')
    );
    cleanups.push(() => {
      disposeView();
      disposeState();
    });
    return { setItems, setVisible };
  });

  flush();
  await tick();
  expect(drawn.splice(0)).toEqual([1, 2]);
  mounted.setVisible(false);
  flush();
  await tick();
  expect(drawn).toEqual([]);
  expect(disposed).toEqual([]);

  mounted.setItems([
    { id: 'b', value: 20 },
    { id: 'a', value: 10 }
  ]);
  mounted.setVisible(true);
  flush();
  await tick();
  expect(drawn).toEqual([20, 10]);
  expect(created).toEqual(['a', 'b']);
  expect(disposed).toEqual([]);

  mounted.setItems([]);
  flush();
  await tick();
  expect(disposed.sort()).toEqual(['a', 'b']);
});

it('turns a thrown frame callback failure into one typed error and stops submission', async () => {
  const onError = vi.fn();

  function Failure() {
    useFrame(() => JSON.parse('invalid JSON'), { continuous: true });
    return null;
  }

  const dispose = render(
    () => (
      <FrameLoop viewport={viewport} onError={onError}>
        <Failure />
      </FrameLoop>
    ),
    document.createElement('div')
  );
  cleanups.push(dispose);

  flush();
  await tick();
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'gpu', code: 'render' }));
  expect(gpu.device.queue.submit).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

it('defers submission while preparation holds a validation scope on the device, then draws once', async () => {
  const { calls, loop } = mount();
  await tick();
  expect(gpu.device.queue.submit).toHaveBeenCalledOnce();
  let finish!: () => void;
  const preparation = serializeGpuPreparation(
    gpu.device,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  calls.length = 0;
  loop.invalidate();
  await tick();
  loop.invalidate();
  await tick();
  expect(calls).toEqual(['update', 'draw', 'update', 'draw']);
  expect(gpu.device.queue.submit).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);

  finish();
  await preparation;
  await tick();
  expect(frames.size).toBe(1);
  await tick();
  expect(gpu.device.queue.submit).toHaveBeenCalledTimes(2);
});

it('presents only after a submitted frame, and not while submission is deferred', async () => {
  const calls: string[] = [];
  const [presenting, setPresenting] = createSignal(false);

  function Present() {
    useFrame(() => calls.push('update'), { phase: 'update' });
    useFrame(() => calls.push(`present after ${vi.mocked(gpu.device.queue.submit).mock.calls.length} submits`), {
      phase: 'present',
      enabled: presenting
    });
    return null;
  }

  const dispose = render(
    () => (
      <FrameLoop viewport={viewport} onError={vi.fn()}>
        <Present />
      </FrameLoop>
    ),
    document.createElement('div')
  );
  cleanups.push(dispose);
  flush();
  await tick();
  expect(calls).toEqual(['update']);

  let finish!: () => void;
  const preparation = serializeGpuPreparation(
    gpu.device,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  calls.length = 0;
  setPresenting(true);
  flush();
  await tick();
  expect(calls).toEqual(['update']);

  finish();
  await preparation;
  await tick();
  await tick();
  expect(calls).toEqual(['update', 'update', 'present after 2 submits']);
});

it('requests a frame when a value read by a draw or render callback changes, but not by an update', async () => {
  const [color, setColor] = createSignal(0);
  const [scale, setScale] = createSignal(1);
  const [speed, setSpeed] = createSignal(1);
  const drawn: number[] = [];

  function Callbacks() {
    useFrame(() => scale());
    useFrame(() => speed(), { phase: 'update' });
    return null;
  }

  mountScene(() => (
    <>
      <Callbacks />
      <RenderLayer draw={() => void drawn.push(color())} />
    </>
  ));
  await tick();
  expect(drawn).toEqual([0]);
  expect(frames.size).toBe(0);

  setColor(1);
  flush();
  // The change only schedules a frame: nothing draws outside the RAF callback.
  expect(drawn).toEqual([0]);
  expect(frames.size).toBe(1);
  await tick();
  expect(drawn).toEqual([0, 1]);
  expect(frames.size).toBe(0);

  setScale(2);
  flush();
  expect(frames.size).toBe(1);
  await tick();
  expect(drawn).toEqual([0, 1, 1]);

  setSpeed(2);
  flush();
  expect(frames.size).toBe(0);
});

it('settles update-phase writes and their effects before rendering, without requesting another frame', async () => {
  const [position, setPosition] = createSignal(0);
  const [moving, setMoving] = createSignal(false);
  const drawn: number[][] = [];
  // Non-reactive state kept in sync by an effect, like a cache that a draw reads.
  let mirrored = 0;

  function Motion() {
    createEffect(position, (value) => {
      mirrored = value;
    });
    useFrame(() => setPosition((value) => value + 1), { phase: 'update', enabled: moving });
    return null;
  }

  mountScene(() => (
    <>
      <Motion />
      <RenderLayer draw={() => void drawn.push([position(), mirrored])} />
    </>
  ));
  await tick();
  expect(drawn).toEqual([[0, 0]]);

  setMoving(true);
  flush();
  await tick();
  expect(drawn).toEqual([
    [0, 0],
    [1, 1]
  ]);
  expect(frames.size).toBe(0);
});

it('stops observing values that the latest frame no longer reads', async () => {
  const [useColor, setUseColor] = createSignal(true);
  const [color, setColor] = createSignal(0);
  const draw = vi.fn(() => {
    if (useColor()) {
      color();
    }
  });

  mountScene(() => <RenderLayer draw={draw} />);
  await tick();

  setUseColor(false);
  flush();
  await tick();
  expect(draw).toHaveBeenCalledTimes(2);

  setColor(1);
  flush();
  expect(frames.size).toBe(0);
});

function mountScene(children: () => JSX.Element) {
  const dispose = createRoot((disposeRoot) => {
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          {children()}
        </FrameLoop>
      ),
      document.createElement('div')
    );

    return () => {
      disposeView();
      disposeRoot();
    };
  });

  cleanups.push(dispose);
  flush();
}

function mount(invalidateFirstFrame = false) {
  const calls: string[] = [];
  let loop!: ReturnType<typeof useFrameLoop>;

  function Draw() {
    loop = useFrameLoop();
    useFrame(() => {
      calls.push('draw');

      if (invalidateFirstFrame) {
        invalidateFirstFrame = false;
        loop.invalidate();
      }
    });

    return null;
  }

  function Update() {
    useFrame(() => calls.push('update'), { phase: 'update' });
    return null;
  }

  const result = createRoot((disposeState) => {
    const [draw, setDraw] = createSignal(true);
    const disposeView = render(
      () => (
        <FrameLoop viewport={viewport} onError={vi.fn()}>
          <Show when={draw()}>
            <Draw />
          </Show>
          <Update />
        </FrameLoop>
      ),
      document.createElement('div')
    );

    const dispose = () => {
      disposeView();
      disposeState();
    };

    cleanups.push(dispose);

    return { setDraw, dispose };
  });

  flush();

  return { ...result, calls, loop };
}

async function tick(timestamp = performance.now()) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(timestamp));
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}
