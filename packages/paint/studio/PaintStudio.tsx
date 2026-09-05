import { createSignal, onSettled, Show } from 'solid-js';
import { BrushPanel, ColorPanel } from './BrushPanel';
import { defaultCamera, transformAt } from './camera';
import { createPaintSession } from './createPaintSession';
import { LayersPanel } from './LayersPanel';
import { NavigationPuck } from './NavigationPuck';
import { SketchIcon } from './SketchIcon';
import './studio.css';

/** Full-canvas workspace with on-demand controls; opening panels never resizes the drawing surface. */
export default function PaintStudio() {
  let canvas!: HTMLCanvasElement, stage!: HTMLDivElement, file!: HTMLInputElement;
  const session = createPaintSession({ canvas: () => canvas, stage: () => stage });
  const {
    brush,
    camera,
    state,
    ready,
    saved,
    error,
    cursor,
    puck,
    metrics,
    send,
    navigate,
    updateBrush,
    openPuck,
    zoom,
    setPuck,
    setError
  } = session;
  const [panel, setPanel] = createSignal<'brush' | 'color' | 'layers' | 'file' | undefined>(undefined, {
    ownedWrite: true
  });
  let launcher: HTMLElement | undefined;
  const closePanel = () => {
    setPanel(undefined);
    launcher?.focus({ preventScroll: true });
  };
  const toggle = (next: NonNullable<ReturnType<typeof panel>>, target: HTMLElement) => {
    launcher = target;
    setPuck(undefined);
    setPanel(panel() === next ? undefined : next);
  };
  onSettled(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel()) closePanel();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  });
  return (
    <div class="paint-studio">
      <input
        ref={file}
        type="file"
        accept=".paint,application/json"
        hidden
        onChange={async (event) => {
          const input = event.currentTarget;
          const picked = input.files?.[0];
          if (!picked) return;
          if (picked.size > 384 * 1024 * 1024) {
            setError({ message: 'This file is too large to open.', recoverable: false });
            return;
          }
          send({ type: 'import', text: await picked.text() });
          input.value = '';
          closePanel();
        }}
      />
      <main ref={stage} class="paint-stage" aria-label="Drawing workspace">
        <canvas
          ref={canvas}
          aria-label="Drawing canvas. Draw with a pen or mouse; use touch or Space-drag to navigate."
        />
        <Show when={ready() && state().tileCount === 0}>
          <div class="paint-welcome">
            <p>Pen to draw. Touch to move.</p>
          </div>
        </Show>
        <Show when={cursor() && ready()}>
          <div
            class="paint-brush-cursor"
            style={{
              left: `${cursor()!.x}px`,
              top: `${cursor()!.y}px`,
              width: `${Math.max(2, brush().size * camera().zoom)}px`,
              height: `${Math.max(2, brush().size * camera().zoom)}px`
            }}
          />
        </Show>
        <Show when={puck()}>
          <NavigationPuck
            position={puck()!}
            camera={camera}
            size={session.size}
            navigate={navigate}
            close={() => setPuck(undefined)}
          />
        </Show>
      </main>
      <div class="paint-ui">
        <span
          class="paint-save-state"
          role="status"
          title={saved() ? 'Saved on this device' : 'Saving completed strokes'}
        >
          {ready() ? (saved() ? 'Saved' : 'Saving…') : 'Starting…'}
        </span>
        <div class="paint-view-controls" aria-label="Canvas view">
          <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
            <SketchIcon name="minus" size={16} />
          </button>
          <button
            aria-label="Reset zoom"
            title="Reset zoom to 100%"
            onClick={() =>
              navigate(
                transformAt(camera(), session.size(), { x: session.size().width / 2, y: session.size().height / 2 }, 1)
              )
            }
          >
            {Math.round(camera().zoom * 100)}%
          </button>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <SketchIcon name="plus" size={16} />
          </button>
          <Show when={Math.abs(camera().angle) > 0.005}>
            <button
              aria-label="Reset rotation"
              title="Reset rotation"
              onClick={() => navigate({ ...camera(), angle: 0 })}
            >
              {Math.round((camera().angle * 180) / Math.PI)}°
            </button>
          </Show>
        </div>
        <nav class="paint-tools" aria-label="Drawing tools">
          <button
            aria-label="Brush"
            title="Brush · B"
            aria-pressed={brush().tool === 'brush' ? 'true' : 'false'}
            onClick={() => updateBrush({ tool: 'brush' })}
          >
            <SketchIcon name="draw" />
          </button>
          <button
            aria-label="Eraser"
            title="Eraser · E"
            aria-pressed={brush().tool === 'eraser' ? 'true' : 'false'}
            onClick={() => updateBrush({ tool: 'eraser' })}
          >
            <SketchIcon name="erase" />
          </button>
          <span class="paint-tool-separator" />
          <button
            aria-label="Mirror canvas"
            title="Mirror view"
            aria-pressed={camera().mirrored ? 'true' : 'false'}
            onClick={() => navigate({ ...camera(), mirrored: !camera().mirrored })}
          >
            <SketchIcon name="mirror" />
          </button>
          <button
            aria-label="Layers"
            title="Layers"
            aria-expanded={panel() === 'layers' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(e) => toggle('layers', e.currentTarget)}
          >
            <SketchIcon name="layers" />
          </button>
        </nav>
        <div class="paint-double-puck" aria-label="Brush and color">
          <button
            aria-label="Brush settings"
            title="Brush settings"
            aria-expanded={panel() === 'brush' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(e) => toggle('brush', e.currentTarget)}
          >
            <SketchIcon name={brush().tool === 'eraser' ? 'erase' : 'draw'} size={22} />
            <small>{Math.round(brush().size)}</small>
          </button>
          <button
            class="paint-color-launcher"
            aria-label="Color palette"
            title="Color palette"
            aria-expanded={panel() === 'color' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(e) => toggle('color', e.currentTarget)}
          >
            <span style={{ background: brush().color }} />
          </button>
        </div>
        <div class="paint-history">
          <button
            class="paint-floating"
            aria-label="Undo"
            title="Undo · ⌘/Ctrl Z"
            disabled={!state().canUndo || !ready()}
            onClick={() => send({ type: 'undo' })}
          >
            <SketchIcon name="undo" />
          </button>
          <button
            class="paint-floating paint-redo"
            aria-label="Redo"
            title="Redo · ⌘/Ctrl Shift Z"
            disabled={!state().canRedo || !ready()}
            onClick={() => send({ type: 'redo' })}
          >
            <SketchIcon name="undo" />
          </button>
        </div>
        <button
          class="paint-menu-trigger paint-floating"
          aria-label="Drawing menu"
          title="Drawing menu"
          aria-expanded={panel() === 'file' ? 'true' : 'false'}
          aria-controls="paint-panel"
          onClick={(e) => toggle('file', e.currentTarget)}
        >
          <SketchIcon name="tools" />
        </button>
        <button
          class="paint-nav-trigger paint-floating"
          aria-label="Navigation puck"
          title="Navigation · V / Right click"
          onClick={() => {
            setPanel(undefined);
            openPuck();
          }}
        >
          <SketchIcon name="pan" />
        </button>
        <Show when={panel()}>
          <button class="paint-panel-dismiss" aria-label="Close panel" onClick={closePanel} />
          <aside id="paint-panel" class="paint-panel" data-panel={panel()} aria-label={`${panel()} panel`}>
            <div class="paint-panel-title">
              <strong>
                {panel() === 'file'
                  ? 'Drawing'
                  : panel() === 'brush'
                    ? 'Brush'
                    : panel() === 'color'
                      ? 'Color'
                      : 'Layers'}
              </strong>
              <button aria-label="Close controls" onClick={closePanel}>
                <SketchIcon name="close" size={18} />
              </button>
            </div>
            <Show when={panel() === 'brush'}>
              <BrushPanel brush={brush} updateBrush={updateBrush} />
            </Show>
            <Show when={panel() === 'color'}>
              <ColorPanel brush={brush} updateBrush={updateBrush} />
            </Show>
            <Show when={panel() === 'layers'}>
              <LayersPanel state={state} ready={ready} layer={session.layer} />
            </Show>
            <Show when={panel() === 'file'}>
              <div class="paint-file-actions">
                <button disabled={!ready()} onClick={() => file.click()}>
                  Open drawing<span>.paint</span>
                </button>
                <button
                  disabled={!ready()}
                  onClick={() => {
                    send({ type: 'download' });
                    closePanel();
                  }}
                >
                  Save drawing<span>.paint</span>
                </button>
                <button
                  disabled={!ready()}
                  onClick={() => {
                    send({ type: 'png' });
                    closePanel();
                  }}
                >
                  Export visible canvas<span>PNG</span>
                </button>
                <button
                  onClick={() => {
                    navigate(defaultCamera());
                    closePanel();
                  }}
                >
                  Reset view
                </button>
                <a href={location.pathname.startsWith('/paint/') ? '/paint' : './'}>Paint experiments</a>
              </div>
              <p class="paint-panel-note">
                B · Brush &nbsp; E · Eraser
                <br />
                Space + drag · Pan &nbsp; V · Navigation
              </p>
              <p class="paint-panel-note" title="CPU preparation/submission time, not pen latency">
                {state().tileCount} tiles · {(metrics().gpu / 1024 / 1024).toFixed(1)} MB · {metrics().ms.toFixed(1)} ms
                submit
              </p>
            </Show>
          </aside>
        </Show>
      </div>
      <Show when={error()}>
        <div class="paint-error" role="alert">
          <strong>{error()!.recoverable ? 'Canvas paused' : 'Could not complete that action'}</strong>
          <p>{error()!.message}</p>
          <Show when={error()!.recoverable}>
            <button
              onClick={() => {
                setError(undefined);
                send({ type: 'recover' });
              }}
            >
              Restore renderer
            </button>
          </Show>
          <button onClick={() => setError(undefined)}>Dismiss</button>
        </div>
      </Show>
    </div>
  );
}
