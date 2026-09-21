import { render } from '@solidjs/web';
import { createRoot, createSignal, flush, For, onCleanup, Show, untrack } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuFixture } from '../../../tests/fixtures/gpuFixture';
import { gpuError } from '../../shared/errors';
import { DocumentCamera, useDocumentCamera } from '../camera/DocumentCamera';
import { FrameLoop, useFrame, useFrameLoop } from './FrameLoop';
import { RenderLayer } from './RenderLayer';

vi.mock('../viewport/Viewport', () => ({
  useViewport: () => ({ size: () => ({ css: { width: 800, height: 600 } }) })
}));

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

it('runs updates before drawing even if JSX mounts the drawing component first', () => {
  const { calls, loop } = mount();

  loop.invalidate();
  loop.invalidate();
  expect(frames.size).toBe(1);

  tick();
  expect(calls).toEqual(['update', 'draw']);
  expect(frames.size).toBe(0);
});

it('unsubscribes removed components and redraws the remaining scene once', () => {
  const { calls, setDraw } = mount();
  tick();
  calls.length = 0;

  setDraw(false);
  flush();
  tick();

  expect(calls).toEqual(['update']);
  expect(frames.size).toBe(0);

  calls.length = 0;
  setDraw(true);
  flush();
  tick();

  expect(calls).toEqual(['update', 'draw']);
  expect(frames.size).toBe(0);
});

it('switches between continuous rendering and idle without creating duplicate RAF loops', () => {
  const { setContinuous, loop } = mount();
  tick();

  setContinuous(true);
  flush();
  loop.invalidate();
  loop.invalidate();
  expect(frames.size).toBe(1);

  tick();
  expect(frames.size).toBe(1);

  setContinuous(false);
  flush();
  tick();
  expect(frames.size).toBe(0);
});

it('stops synchronously on GPU cancellation and ignores subsequent invalidations', () => {
  const { loop, calls } = mount();
  expect(frames.size).toBe(1);

  abort.abort();
  loop.invalidate();
  tick();

  expect(frames.size).toBe(0);
  expect(calls).toEqual([]);
});

it('cancels scheduled callbacks when the JSX tree is disposed', () => {
  const { dispose, loop, calls } = mount();
  dispose();
  loop.invalidate();
  tick();

  expect(frames.size).toBe(0);
  expect(calls).toEqual([]);
});

it('preserves a new invalidation requested from a frame callback', () => {
  const { calls } = mount(true);
  tick();
  expect(frames.size).toBe(1);

  tick();
  expect(calls).toEqual(['update', 'draw', 'update', 'draw']);
  expect(frames.size).toBe(0);
});

it('composes independently mounted layers, reacts to order and removes them without stopping siblings', () => {
  const calls: string[] = [];
  const mounted = createRoot((disposeState) => {
    const [visible, setVisible] = createSignal(false);
    const [order, setOrder] = createSignal(-1);
    const disposeView = render(
      () => (
        <FrameLoop onError={vi.fn()}>
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
  tick();
  expect(calls.splice(0)).toEqual(['sibling']);

  mounted.setVisible(true);
  flush();
  tick();
  expect(calls.splice(0)).toEqual(['late', 'sibling']);

  mounted.setOrder(1);
  flush();
  tick();
  expect(calls.splice(0)).toEqual(['sibling', 'late']);

  mounted.setVisible(false);
  flush();
  tick();
  expect(calls.splice(0)).toEqual(['sibling']);
  expect(frames.size).toBe(0);
  expect(gpu.device.queue.submit).toHaveBeenCalledTimes(4);
});

it('evaluates render children under the loop context and owns their subscriptions and cleanup', () => {
  const cleanup = vi.fn();
  const callback = vi.fn();
  const onError = vi.fn();
  let loop!: ReturnType<typeof useFrameLoop>;
  let mounts = 0;

  const mounted = createRoot((disposeState) => {
    const [continuous, setContinuous] = createSignal(false);
    const [visible, setVisible] = createSignal(true);
    const disposeView = render(
      () => (
        <FrameLoop continuous={continuous()} onError={onError}>
          {(value) => {
            mounts++;
            loop = value;
            expect(useFrameLoop()).toBe(value);
            useFrame(callback, { phase: 'update' });
            onCleanup(cleanup);

            return (
              <Show when={visible()}>
                <RenderLayer draw={() => {}} />
              </Show>
            );
          }}
        </FrameLoop>
      ),
      document.createElement('div')
    );

    const dispose = () => {
      disposeView();
      disposeState();
    };

    cleanups.push(dispose);
    return { setContinuous, setVisible, dispose };
  });

  flush();
  tick();
  expect(callback).toHaveBeenCalledOnce();

  mounted.setContinuous(true);
  mounted.setVisible(false);
  flush();
  tick();
  expect(mounts).toBe(1);
  expect(cleanup).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledTimes(2);

  const error = gpuError('render', 'Cannot prepare document');
  loop.fail(error);
  loop.invalidate();
  tick();
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  expect(frames.size).toBe(0);

  mounted.dispose();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledTimes(2);
});

it('follows JSX order for late siblings and keyed list reordering without recreating GPU owners', () => {
  const calls: string[] = [];
  const mountedLayers: number[] = [];
  const disposedLayers: number[] = [];

  function Layer(props: { id: number }) {
    const camera = useDocumentCamera();
    mountedLayers.push(props.id);
    onCleanup(() => disposedLayers.push(props.id));

    return (
      <RenderLayer
        draw={() => {
          calls.push(`${props.id}:${camera.zoom}`);
        }}
      />
    );
  }

  const mounted = createRoot((disposeState) => {
    const [early, setEarly] = createSignal(false);
    const [ids, setIds] = createSignal([1, 2]);
    const disposeView = render(
      () => (
        <FrameLoop onError={vi.fn()}>
          <DocumentCamera>
            <Show when={early()}>
              <Layer id={0} />
            </Show>
            <For each={ids()}>{(id) => <Layer id={id} />}</For>
          </DocumentCamera>
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
  tick();
  expect(calls.splice(0)).toEqual(['1:2', '2:2']);

  mounted.setEarly(true);
  flush();
  tick();
  expect(calls.splice(0)).toEqual(['0:2', '1:2', '2:2']);

  mounted.setIds([2, 1]);
  flush();
  tick();
  expect(calls.splice(0)).toEqual(['0:2', '2:2', '1:2']);
  expect(mountedLayers).toEqual([1, 2, 0]);
  expect(disposedLayers).toEqual([]);

  mounted.setEarly(false);
  mounted.setIds([]);
  flush();
  tick();
  expect(calls).toEqual([]);
  expect(disposedLayers.sort()).toEqual([0, 1, 2]);
  expect(gpu.device.queue.submit).toHaveBeenCalledTimes(4);
  expect(frames.size).toBe(0);
});

it('reacts to replacing a token draw prop without remounting the layer', () => {
  const first = vi.fn();
  const second = vi.fn();
  const mounted = createRoot((disposeState) => {
    const [draw, setDraw] = createSignal(() => first);
    const disposeView = render(
      () => (
        <FrameLoop onError={vi.fn()}>
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
  tick();
  expect(first).toHaveBeenCalledOnce();

  mounted.setDraw(() => second);
  flush();
  tick();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);
});

it('keeps independent animations running until the last enabled owner unsubscribes', () => {
  const a = vi.fn();
  const b = vi.fn();
  const mounted = createRoot((disposeState) => {
    const [enabledA, setA] = createSignal(true);
    const [enabledB, setB] = createSignal(true);
    const [mountedB, mountB] = createSignal(true);

    function AnimationB() {
      useFrame(b, { enabled: enabledB, continuous: true });
      return null;
    }

    const disposeView = render(
      () => (
        <FrameLoop onError={vi.fn()}>
          {() => {
            useFrame(a, { enabled: enabledA, continuous: true });
            return (
              <Show when={mountedB()}>
                <AnimationB />
              </Show>
            );
          }}
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
  tick(1000);
  tick(1016);
  expect(a.mock.calls[1]![0]).toMatchObject({ delta: 0.016, time: 0.016 });
  expect(frames.size).toBe(1);

  mounted.setA(false);
  flush();
  tick(1032);
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(3);
  expect(frames.size).toBe(1);

  mounted.mountB(false);
  flush();
  tick(1048);
  expect(b).toHaveBeenCalledTimes(3);
  expect(frames.size).toBe(0);

  mounted.setA(true);
  flush();
  tick(5000);
  expect(a.mock.lastCall![0].delta).toBe(0);
  expect(frames.size).toBe(1);
});

it('pauses hidden pages, retains invalidation and resumes without advancing animation time', () => {
  const callback = vi.fn();
  let loop!: ReturnType<typeof useFrameLoop>;
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const dispose = render(
    () => (
      <FrameLoop onError={vi.fn()}>
        {(value) => {
          loop = value;
          useFrame(callback, { continuous: true });
          return null;
        }}
      </FrameLoop>
    ),
    document.createElement('div')
  );
  cleanups.push(() => {
    dispose();
    visibility.mockRestore();
  });

  flush();
  tick(1000);
  tick(1020);

  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  loop.invalidate();
  expect(frames.size).toBe(0);
  expect(callback).toHaveBeenCalledTimes(2);

  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  tick(10000);
  expect(callback.mock.lastCall![0]).toEqual({ timestamp: 10000, delta: 0, time: 0.02 });
  tick(20000);
  expect(callback.mock.lastCall![0].delta).toBe(0.1);

  dispose();
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  expect(frames.size).toBe(0);
});

it('hides keyed layers without disposing resources and preserves owners when object identities change', () => {
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
        <FrameLoop onError={vi.fn()}>
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
  tick();
  expect(drawn.splice(0)).toEqual([1, 2]);
  mounted.setVisible(false);
  flush();
  tick();
  expect(drawn).toEqual([]);
  expect(disposed).toEqual([]);

  mounted.setItems([
    { id: 'b', value: 20 },
    { id: 'a', value: 10 }
  ]);
  mounted.setVisible(true);
  flush();
  tick();
  expect(drawn).toEqual([20, 10]);
  expect(created).toEqual(['a', 'b']);
  expect(disposed).toEqual([]);

  mounted.setItems([]);
  flush();
  tick();
  expect(disposed.sort()).toEqual(['a', 'b']);
});

it('turns a thrown frame callback failure into one typed error and stops submission', () => {
  const onError = vi.fn();
  const dispose = render(
    () => (
      <FrameLoop onError={onError}>
        {() => {
          useFrame(() => JSON.parse('invalid JSON'), { continuous: true });
          return null;
        }}
      </FrameLoop>
    ),
    document.createElement('div')
  );
  cleanups.push(dispose);

  flush();
  tick();
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'gpu', code: 'render' }));
  expect(gpu.device.queue.submit).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

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
    const [continuous, setContinuous] = createSignal(false);
    const disposeView = render(
      () => (
        <FrameLoop continuous={continuous()} onError={vi.fn()}>
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

    return { setDraw, setContinuous, dispose };
  });

  flush();

  return { ...result, calls, loop };
}

function tick(timestamp = performance.now()) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(timestamp));
  flush();
}
