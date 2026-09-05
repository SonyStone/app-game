import { For, Show, createSignal } from 'solid-js';
import {
  clearActiveDrawing,
  setActiveMaterialStrokeColor,
  setActiveMaterialStrokeRadius,
  undoActiveDrawing,
  type GreaseMaterial
} from '../document';
import { BrushControls } from '../features/brush/BrushControls';
import { StrokeColorStrip } from '../features/brush/StrokeColorStrip';
import { vec4ToCss } from '../features/shared/color';
import { ToolModeBar } from '../features/tools/ToolModeBar';
import { SketchIcon } from '../shared/SketchIcon';
import { sketchPanels, type SketchPanel } from '../shared/sketchPanel';
import type { ToolMode } from '../shared/toolMode';
import type { ViewportMode } from '../shared/viewportMode';
import type { DocumentUpdater } from './useDocumentSession';

/** Fullscreen Sketchbook controls: tool palette, double puck, and a collapsible marking menu. */
export function AppToolbar(props: AppToolbarProps) {
  const [popup, setPopup] = createSignal<'menu' | 'brush' | 'color' | 'actions'>();
  let returnFocus: HTMLButtonElement | undefined;

  const closePopup = () => {
    setPopup(undefined);
    returnFocus?.focus();
  };
  const togglePopup = (next: NonNullable<ReturnType<typeof popup>>, button: HTMLButtonElement) => {
    returnFocus = button;
    props.onSetPanel(undefined);
    setPopup(popup() === next ? undefined : next);
  };

  return (
    <div
      class="canvas-ui"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !popup()) return;
        event.preventDefault();
        event.stopPropagation();
        closePopup();
      }}
    >
      <ToolModeBar viewportMode={props.viewportMode} mode={props.mode} onSetMode={props.onSetMode} />

      <div class="viewport-mode-switch" role="group" aria-label="Viewport mode">
        <For each={['2d', '3d'] as const}>
          {(view) => (
            <button
              type="button"
              aria-label={view === '2d' ? 'Paper 2D' : 'Space 3D'}
              aria-pressed={props.viewportMode === view ? 'true' : 'false'}
              onClick={() => props.onSetViewportMode(view)}
            >
              {view.toUpperCase()}
            </button>
          )}
        </For>
      </div>

      <div class="double-puck" aria-label="Brush and color">
        <button
          class="brush-puck"
          type="button"
          aria-label="Brush settings"
          title="Brush settings"
          aria-expanded={popup() === 'brush' ? 'true' : 'false'}
          onClick={(event) => togglePopup('brush', event.currentTarget)}
        >
          <span
            class="brush-stamp"
            style={{ width: `${Math.max(5, props.activeMaterial.strokeRadius * 240)}px`, opacity: props.brushStrength }}
          />
          <SketchIcon name={props.mode === 'erase' ? 'erase' : 'draw'} size={19} />
        </button>
        <button
          class="color-puck"
          type="button"
          aria-label="Color palette"
          title="Color palette"
          aria-expanded={popup() === 'color' ? 'true' : 'false'}
          onClick={(event) => togglePopup('color', event.currentTarget)}
        >
          <span style={{ 'background-color': vec4ToCss(props.activeMaterial.strokeColor) }} />
        </button>
      </div>

      <button
        class="corner-undo floating-button"
        type="button"
        title="Undo last stroke"
        aria-label="Undo last stroke"
        disabled={!props.canUndo}
        onClick={() => props.updateDocument(undoActiveDrawing)}
      >
        <SketchIcon name="undo" />
      </button>

      <button
        class="marking-trigger floating-button"
        type="button"
        aria-label="Quick tools"
        title="Quick tools"
        aria-expanded={popup() === 'menu' ? 'true' : 'false'}
        onClick={(event) => togglePopup('menu', event.currentTarget)}
      >
        <SketchIcon name={popup() === 'menu' ? 'close' : 'tools'} size={22} />
      </button>

      <Show when={popup()}>
        <button class="popup-dismiss" type="button" aria-label="Close quick controls" onClick={closePopup} />
      </Show>
      <Show when={popup() === 'menu'}>
        <nav class="marking-menu" aria-label="Quick tools menu">
          <For each={sketchPanels}>
            {(panel, index) => (
              <button
                class="panel-launcher floating-button"
                type="button"
                aria-label={panel.label}
                title={panel.label}
                style={menuPosition(index())}
                aria-controls="sketch-inspector"
                aria-expanded={props.panel === panel.id ? 'true' : 'false'}
                onClick={() => {
                  setPopup(undefined);
                  props.onSetPanel(panel.id);
                }}
              >
                <SketchIcon name={panel.id} />
              </button>
            )}
          </For>
          <button
            class="floating-button"
            type="button"
            aria-label="Drawing actions"
            title="Drawing actions"
            style={menuPosition(4)}
            onClick={() => setPopup('actions')}
          >
            <SketchIcon name="more" />
          </button>
        </nav>
      </Show>

      <Show when={popup() === 'brush'}>
        <section class="puck-popover brush-popover" aria-label="Brush settings panel">
          <div class="popover-heading">
            Brush
            <button class="icon-button" type="button" aria-label="Close brush settings" onClick={closePopup}>
              <SketchIcon name="close" size={17} />
            </button>
          </div>
          <BrushControls
            mode={props.mode}
            strokeRadius={props.activeMaterial.strokeRadius}
            brushStrength={props.brushStrength}
            eraserRadius={props.eraserRadius}
            onSetStrokeRadius={(radius) =>
              props.updateDocument((document) => setActiveMaterialStrokeRadius(document, radius))
            }
            onSetBrushStrength={props.onSetBrushStrength}
            onSetEraserRadius={props.onSetEraserRadius}
          />
        </section>
      </Show>
      <Show when={popup() === 'color'}>
        <section class="puck-popover color-popover" aria-label="Color palette panel">
          <div class="popover-heading">
            Color
            <button class="icon-button" type="button" aria-label="Close color palette" onClick={closePopup}>
              <SketchIcon name="close" size={17} />
            </button>
          </div>
          <StrokeColorStrip
            activeStrokeColor={props.activeMaterial.strokeColor}
            onSetStrokeColor={(color) =>
              props.updateDocument((document) => setActiveMaterialStrokeColor(document, color))
            }
          />
          <label class="custom-color-control">
            Custom color
            <input
              type="color"
              aria-label="Custom color"
              value={`#${props.activeMaterial.strokeColor
                .slice(0, 3)
                .map((value) =>
                  Math.round(value * 255)
                    .toString(16)
                    .padStart(2, '0')
                )
                .join('')}`}
              onInput={(event) => {
                const value = event.currentTarget.value;
                props.updateDocument((document) =>
                  setActiveMaterialStrokeColor(document, [
                    parseInt(value.slice(1, 3), 16) / 255,
                    parseInt(value.slice(3, 5), 16) / 255,
                    parseInt(value.slice(5, 7), 16) / 255,
                    1
                  ])
                );
              }}
            />
          </label>
        </section>
      </Show>
      <Show when={popup() === 'actions'}>
        <section class="drawing-actions-popover" aria-label="Drawing actions panel">
          <div class="popover-heading">
            Drawing
            <button class="icon-button" type="button" aria-label="Close drawing actions" onClick={closePopup}>
              <SketchIcon name="close" size={17} />
            </button>
          </div>
          <label class="touch-drawing-toggle toggle-control">
            <input
              type="checkbox"
              checked={props.touchDrawing}
              onChange={(event) => props.onSetTouchDrawing(event.currentTarget.checked)}
            />
            Draw with finger
          </label>
          <button
            type="button"
            onClick={() => {
              props.onResetView();
              closePopup();
            }}
          >
            Reset view
          </button>
          <button
            type="button"
            disabled={!props.canDeleteSelection}
            onClick={() => {
              props.onDeleteSelection();
              closePopup();
            }}
          >
            Delete selection
          </button>
          <button
            type="button"
            disabled={!props.canUndo}
            onClick={() => {
              props.updateDocument(clearActiveDrawing);
              closePopup();
            }}
          >
            Clear active layer
          </button>
        </section>
      </Show>
    </div>
  );
}

type AppToolbarProps = {
  touchDrawing: boolean;
  onSetTouchDrawing: (enabled: boolean) => void;
  activeMaterial: GreaseMaterial;
  brushStrength: number;
  canDeleteSelection: boolean;
  canUndo: boolean;
  eraserRadius: number;
  mode: ToolMode;
  viewportMode: ViewportMode;
  panel: SketchPanel | undefined;
  onSetPanel: (panel: SketchPanel | undefined) => void;
  onResetView: () => void;
  onDeleteSelection: () => void;
  onSetBrushStrength: (strength: number) => void;
  onSetEraserRadius: (radius: number) => void;
  onSetMode: (mode: ToolMode) => void;
  onSetViewportMode: (mode: ViewportMode) => void;
  updateDocument: DocumentUpdater;
};

/** Places the five inspector/action controls above the marking-menu trigger. */
function menuPosition(index: number) {
  const angle = Math.PI - (index * Math.PI) / 4;
  return { left: `${114 + 108 * Math.cos(angle)}px`, top: `${108 - 108 * Math.sin(angle)}px` };
}
