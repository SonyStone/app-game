import type { JSX } from '@solidjs/web';
import { render } from '@solidjs/web';
import { For, Show, createEffect, createSignal, onCleanup, onSettled } from 'solid-js';
import { Spector } from '../spector';
import { SpectorResultView } from './spector-result-view';
import { createSpectorSession, type SpectorSession } from './spector-session';

/** Configuration for mounting the standalone Solid Spector overlay. */
export interface MountSpectorUIOptions {
  /** Existing engine to control. A new engine is created when omitted. */
  readonly spector?: Spector;
  /** Document element that receives the overlay host. Defaults to `document.body`. */
  readonly root?: Element;
  /** Canvas selected when the overlay opens. */
  readonly canvas?: HTMLCanvasElement;
}

/**
 * Mounts the standalone Solid capture toolbar and result viewer. The returned function removes the
 * frontend and disposes the underlying Spector engine.
 */
export function mountSpectorUI(options: MountSpectorUIOptions = {}): () => void {
  const root = options.root ?? document.body;
  const host = document.createElement('div');
  host.dataset.spectorUi = 'true';
  root.append(host);
  let session: SpectorSession | undefined;
  let disposeView: (() => void) | undefined;
  let disposed = false;

  queueMicrotask(() => {
    if (disposed) return;
    const currentSession = createSpectorSession(options.spector ?? new Spector());
    session = currentSession;
    disposeView = render(() => <SpectorOverlay session={currentSession} initialCanvas={options.canvas} />, host);
  });

  return () => {
    disposed = true;
    disposeView?.();
    session?.dispose();
    host.remove();
  };
}

/** Standalone Solid toolbar for selecting a page canvas and opening captured results. */
export function SpectorOverlay(props: {
  readonly session: SpectorSession;
  readonly initialCanvas?: HTMLCanvasElement;
}): JSX.Element {
  const [canvases, setCanvases] = createSignal<readonly HTMLCanvasElement[]>([]);
  const [selectedCanvas, setSelectedCanvas] = createSignal<HTMLCanvasElement>();
  const [paused, setPaused] = createSignal(false);
  const [fps, setFps] = createSignal(0);
  const [resultsVisible, setResultsVisible] = createSignal(false);
  let mutationObserver: MutationObserver | undefined;
  let fpsInterval: ReturnType<typeof setInterval> | undefined;
  let latestCaptureCount = 0;

  onSettled(() => {
    refreshCanvases();
    mutationObserver = new MutationObserver(refreshCanvases);
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    fpsInterval = setInterval(() => setFps(props.session.getFps()), 1000);
  });

  onCleanup(() => {
    mutationObserver?.disconnect();
    if (fpsInterval !== undefined) clearInterval(fpsInterval);
  });

  createEffect(
    () => props.session.captures().length,
    (count) => {
      if (count > latestCaptureCount) setResultsVisible(true);
      latestCaptureCount = count;
    }
  );

  const errorMessage = () => {
    const status = props.session.status();
    return status.type === 'error' ? status.message : undefined;
  };

  function refreshCanvases(): void {
    const nextCanvases = Array.from(document.querySelectorAll('canvas'));
    setCanvases(nextCanvases);
    const selected = selectedCanvas();
    if (selected && nextCanvases.includes(selected)) return;
    setSelectedCanvas(
      props.initialCanvas && nextCanvases.includes(props.initialCanvas) ? props.initialCanvas : nextCanvases[0]
    );
  }

  function capture(): void {
    const canvas = selectedCanvas();
    if (canvas) props.session.captureCanvas(canvas);
  }

  function togglePlayback(): void {
    if (paused()) props.session.play();
    else props.session.pause();
    setPaused(!paused());
  }

  const selectedCanvasLabel = () => {
    const canvas = selectedCanvas();
    return canvas ? `(${canvas.width}*${canvas.height})` : 'Choose Canvas...';
  };

  return (
    <>
      <aside class="absolute top-[10px] left-[20%] z-[99999] ml-[-209px] box-content h-10 w-[400px] border-2 border-[#222] bg-[#2c2c2c] p-[7px] font-['Consolas','monaco','monospace'] text-[14px] font-medium text-[#f9f9f9]">
        <label class="relative float-left h-full w-1/2">
          <span class="mx-[5px] inline-block w-[190px] overflow-hidden leading-10 text-ellipsis whitespace-nowrap">
            {selectedCanvasLabel()}
          </span>
          <select
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Canvas to capture"
            value={canvasIndex(canvases(), selectedCanvas())}
            onChange={(event) => setSelectedCanvas(canvases()[event.currentTarget.selectedIndex])}
          >
            <For each={canvases()}>
              {(canvas, index) => (
                <option value={index()}>
                  Id: {canvas.id} - Size: {canvas.width}*{canvas.height}
                </option>
              )}
            </For>
          </select>
        </label>
        <div class="float-left mt-[7.5px] h-full w-[30%]">
          <button
            class="float-left h-[21px] w-[21px] rounded-full border-2 border-red-600 bg-[#2c2c2c] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            aria-label="Capture frame"
            disabled={!selectedCanvas() || props.session.status().type === 'capturing'}
            onClick={capture}
          />
          <button
            class="relative float-left ml-[9px] h-[21px] w-[21px] rounded-full border-2 border-[#f9f9f9]"
            type="button"
            onClick={togglePlayback}
            title={paused() ? 'Play' : 'Pause'}
            aria-label={paused() ? 'Play' : 'Pause'}
          >
            <Show
              when={paused()}
              fallback={
                <>
                  <span class="absolute top-[4px] left-[6px] h-[13px] w-0.5 bg-[#f9f9f9]" />
                  <span class="absolute top-[4px] left-[11px] h-[13px] w-0.5 bg-[#f9f9f9]" />
                </>
              }
            >
              <span class="absolute top-[5px] left-[6px] h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-[#f9f9f9]" />
            </Show>
          </button>
          <Show when={paused()}>
            <button
              class="relative float-left ml-[9px] h-[21px] w-[21px] rounded-full border-2 border-[#f9f9f9]"
              type="button"
              onClick={() => props.session.playNextFrame()}
              title="Play one frame"
              aria-label="Play one frame"
            >
              <span class="absolute top-[5px] left-[5px] h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-[#f9f9f9]" />
              <span class="absolute top-[4px] right-[4px] h-[13px] w-0.5 bg-[#f9f9f9]" />
            </button>
          </Show>
        </div>
        <span class="float-left h-full w-1/5 leading-10 whitespace-nowrap">{fps().toFixed(2)} Fps</span>
      </aside>

      <aside class="absolute top-[66px] left-[20%] z-[80000] ml-[-209px] box-content h-10 w-[400px] border-2 border-[#222] bg-[#2c2c2c] p-[7px] font-['Consolas','monaco','monospace'] text-[14px] font-medium text-[#f9f9f9]">
        <Show
          when={errorMessage()}
          fallback={
            selectedCanvas()
              ? 'Record with the red button, you can also pause or continue playing the current scene.'
              : 'Please, select a canvas in the list above.'
          }
        >
          {(message) => <span class="text-red-500">{message()}</span>}
        </Show>
      </aside>

      <Show when={resultsVisible()}>
        <section class="fixed inset-0 z-[100000] overflow-hidden bg-[#222]">
          <SpectorResultView
            captures={props.session.captures()}
            onAddCapture={props.session.addCapture}
            onCompileProgram={props.session.rebuildProgram}
            onClose={() => setResultsVisible(false)}
          />
        </section>
      </Show>
    </>
  );
}

function canvasIndex(canvases: readonly HTMLCanvasElement[], selected: HTMLCanvasElement | undefined): number {
  return selected ? Math.max(0, canvases.indexOf(selected)) : 0;
}
