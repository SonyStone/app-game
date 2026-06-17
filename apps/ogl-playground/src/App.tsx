import { Canvas, Transform, type OglRootState } from '@work-ilyas/solid-ogl';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { demos } from './examples/demo-data';
import { BasePrimitivesScene } from './examples/BasePrimitivesScene';
import { DrawModesScene } from './examples/DrawModesScene';
import {
  ExampleControlsMount,
  ExampleControlsProvider,
} from './examples/controls-context';
import { HelpersScene } from './examples/HelpersScene';
import { InstancingScene } from './examples/InstancingScene';
import { MonolithScene } from './examples/MonolithScene';
import { ParticlesScene } from './examples/ParticlesScene';
import { PolylinesScene } from './examples/PolylinesScene';
import { RenderToTextureScene } from './examples/RenderToTextureScene';
import { SceneGraphScene } from './examples/SceneGraphScene';
import type { DemoId } from './examples/types';
import { makeUrlSearchParams } from './utils/makeUrlSearchParams';

const FPS_HISTORY_SIZE = 72;
const FPS_GRAPH_MAX = 120;

export default function App() {
  const [focusedDemoId, setFocusedDemoId] = makeUrlSearchParams(
    createSignal<DemoId>('monolith'),
    { key: 'active' },
  );
  const [selectedDemoIds, setSelectedDemoIds] = makeUrlSearchParams(
    createSignal<DemoId[]>(['monolith']),
    { key: 'selected' },
  );
  const [oglState, setOglState] = createSignal<OglRootState>();
  const [fpsHistory, setFpsHistory] = createSignal<number[]>(
    Array.from({ length: FPS_HISTORY_SIZE }, () => 0),
  );

  const selectedDemos = createMemo(() =>
    demos.filter((demo) => selectedDemoIds().includes(demo.id)),
  );
  const selectedDemo = createMemo(() => {
    const focusedDemo = selectedDemos().find(
      (demo) => demo.id === focusedDemoId(),
    );

    return focusedDemo ?? selectedDemos()[0] ?? demos[0];
  });
  const currentFps = () => oglState()?.fps() ?? 0;
  const averageFps = () => oglState()?.averageFps() ?? 0;

  const isDemoSelected = (id: DemoId) => selectedDemoIds().includes(id);

  const focusDemo = (id: DemoId) => {
    if (!selectedDemoIds().includes(id)) {
      setSelectedDemoIds((current) => [...current, id]);
    }

    setFocusedDemoId(id);
  };

  const toggleDemoSelection = (id: DemoId) => {
    let nextFocusedId: DemoId | undefined;

    setSelectedDemoIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) {
          return current;
        }

        const next = current.filter((value) => value !== id);
        if (focusedDemoId() === id) {
          nextFocusedId = next[0];
        }
        return next;
      }

      return [...current, id];
    });

    if (nextFocusedId) {
      setFocusedDemoId(nextFocusedId);
    }
  };

  const currentFpsFill = createMemo(
    () => `${(Math.min(currentFps(), 120) / 120) * 100}%`,
  );
  const averageFpsFill = createMemo(
    () => `${(Math.min(averageFps(), 120) / 120) * 100}%`,
  );
  const fpsStats = createMemo(() => {
    const samples = fpsHistory().filter((value) => value > 0);

    if (samples.length === 0) {
      return { min: 0, max: 0 };
    }

    return {
      min: Math.min(...samples),
      max: Math.max(...samples),
    };
  });
  const fpsGraphPoints = createMemo(() => {
    const history = fpsHistory();
    const width = 100;
    const height = 40;

    return history
      .map((value, index) => {
        const x =
          history.length === 1 ? 0 : (index / (history.length - 1)) * width;
        const y =
          height - (Math.min(value, FPS_GRAPH_MAX) / FPS_GRAPH_MAX) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  createEffect(() => {
    const state = oglState();
    if (!state) {
      return;
    }

    const frame = state.frame();
    const nextFps = state.fps();

    if (frame === 0) {
      setFpsHistory(Array.from({ length: FPS_HISTORY_SIZE }, () => 0));
      return;
    }

    setFpsHistory((history) => [...history.slice(1), nextFps]);
  });

  return (
    <ExampleControlsProvider selectedIds={selectedDemoIds}>
      <main class="flex h-screen flex-col bg-stone-950 text-stone-50 lg:flex-row">
        <aside class="w-full shrink-0 overflow-auto border-b border-stone-800 bg-stone-950/90 p-4 lg:w-96 lg:border-r lg:border-b-0">
          <div class="flex h-full flex-col gap-5">
            <header class="grid gap-2">
              <p class="text-xs uppercase tracking-[0.24em] text-amber-300/80">
                solid-ogl playground
              </p>
              {/* <h1 class="text-lg font-semibold text-stone-50">
                Wrapper stress demos
              </h1>
              <p class="text-sm leading-6 text-stone-400">
                A few ports from ogl&apos;s example set, mounted with the Solid
                wrapper so you can switch between different scene-graph, helper,
                and geometry workloads.
              </p> */}
            </header>

            <nav class="grid gap-2">
              <For each={demos}>
                {(demo) => {
                  const active = createMemo(() => demo.id === focusedDemoId());
                  const checked = createMemo(() => isDemoSelected(demo.id));

                  return (
                    <div
                      class="rounded-xl border px-3 py-3 transition"
                      classList={{
                        'border-amber-300/70 bg-amber-300/10 text-stone-50 shadow-[0_0_0_1px_rgba(253,230,138,0.15)]':
                          active(),
                        'border-teal-400/30 bg-teal-400/5 text-stone-100':
                          checked() && !active(),
                        'border-stone-800 bg-stone-900/70 text-stone-300 hover:border-stone-700 hover:bg-stone-900':
                          !checked(),
                      }}>
                      <div class="flex items-start gap-3">
                        <input
                          class="mt-1 h-4 w-4 shrink-0 rounded border-stone-700 bg-stone-950 accent-amber-300"
                          type="checkbox"
                          checked={checked()}
                          aria-label={`Toggle ${demo.title}`}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleDemoSelection(demo.id)}
                        />

                        <button
                          class="min-w-0 flex-1 text-left"
                          type="button"
                          onClick={() => focusDemo(demo.id)}>
                          <div class="flex items-center justify-between gap-3">
                            <strong class="text-sm font-medium">
                              {demo.title}
                            </strong>
                            <span class="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                              {demo.id}
                            </span>
                          </div>
                          {/* <p class="mt-2 text-sm leading-6 text-stone-400">
                            {demo.summary}
                          </p> */}
                        </button>
                      </div>
                    </div>
                  );
                }}
              </For>
            </nav>

            <section class="grid gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-[0.22em] text-stone-500">
                    fps meter
                  </p>
                  {/* <p class="mt-1 text-sm text-stone-300">
                    Live frame timing from the playground render loop.
                  </p> */}
                </div>
                <strong class="text-2xl font-mono text-stone-50">
                  {currentFps().toFixed(1)}
                </strong>
              </div>

              <div class="grid gap-2 rounded-xl border border-stone-800 bg-stone-950/70 p-3">
                <div class="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <span>Frame history</span>
                  <span>
                    {fpsStats().min.toFixed(1)} - {fpsStats().max.toFixed(1)}{' '}
                    fps
                  </span>
                </div>
                <svg
                  class="h-24 w-full overflow-visible"
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  aria-label="FPS history graph"
                  role="img">
                  <path
                    d="M 0 40 L 0 22 L 100 22"
                    fill="none"
                    stroke="rgb(68 64 60)"
                    stroke-dasharray="2 3"
                    stroke-width="0.7"
                  />
                  <path
                    d="M 0 40 L 0 10 L 100 10"
                    fill="none"
                    stroke="rgb(68 64 60)"
                    stroke-dasharray="2 3"
                    stroke-width="0.7"
                  />
                  <polyline
                    points={fpsGraphPoints()}
                    fill="none"
                    stroke="rgb(45 212 191)"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <div class="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  <span>Recent frame drops appear as downward spikes.</span>
                  <span>Cap: {FPS_GRAPH_MAX}</span>
                </div>
              </div>

              <div class="grid gap-2">
                <div class="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <span>Current</span>
                  <span>{currentFps().toFixed(1)} fps</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-stone-950">
                  <div
                    class="h-full rounded-full bg-linear-to-r from-amber-400 via-yellow-300 to-lime-300 transition-[width] duration-200"
                    style={{ width: currentFpsFill() }}
                  />
                </div>
              </div>

              <div class="grid gap-2">
                <div class="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <span>Average</span>
                  <span>{averageFps().toFixed(1)} fps</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-stone-950">
                  <div
                    class="h-full rounded-full bg-linear-to-r from-sky-400 via-cyan-300 to-teal-300 transition-[width] duration-300"
                    style={{ width: averageFpsFill() }}
                  />
                </div>
              </div>
            </section>

            <ExampleControlsMount />

            <button
              class="mt-auto rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
              type="button"
              onClick={() => oglState()?.resetTiming()}>
              Reset animation time
            </button>
          </div>
        </aside>

        <section class="min-h-0 flex-1 p-4">
          <div class="h-full overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
            <Canvas
              class="h-full w-full"
              clearColor={selectedDemo().clearColor}
              camera={{ fov: 42 }}
              onCreated={(state) => {
                setOglState(state);
                state.camera().position.set(0, 0, 8.5);
                state.camera().lookAt([0, 0, 0]);
              }}>
              <Show when={isDemoSelected('monolith')}>
                <Transform rotation={[0.3, -0.45, 0]}>
                  <MonolithScene />
                </Transform>
              </Show>

              <Show when={isDemoSelected('primitives')}>
                <BasePrimitivesScene
                  makeDefault={selectedDemo().id === 'primitives'}
                />
              </Show>

              <Show when={isDemoSelected('helpers')}>
                <HelpersScene makeDefault={selectedDemo().id === 'helpers'} />
              </Show>

              <Show when={isDemoSelected('scene-graph')}>
                <SceneGraphScene
                  makeDefault={selectedDemo().id === 'scene-graph'}
                />
              </Show>

              <Show when={isDemoSelected('particles')}>
                <ParticlesScene
                  makeDefault={selectedDemo().id === 'particles'}
                />
              </Show>

              <Show when={isDemoSelected('draw-modes')}>
                <DrawModesScene
                  makeDefault={selectedDemo().id === 'draw-modes'}
                />
              </Show>

              <Show when={isDemoSelected('instancing')}>
                <InstancingScene
                  makeDefault={selectedDemo().id === 'instancing'}
                />
              </Show>

              <Show when={isDemoSelected('polylines')}>
                <PolylinesScene
                  makeDefault={selectedDemo().id === 'polylines'}
                />
              </Show>

              <Show when={isDemoSelected('render-to-texture')}>
                <RenderToTextureScene
                  makeDefault={selectedDemo().id === 'render-to-texture'}
                />
              </Show>
            </Canvas>
          </div>
        </section>
      </main>
    </ExampleControlsProvider>
  );
}
