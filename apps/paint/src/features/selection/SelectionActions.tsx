import type { Point, ViewSize } from '@app-game/paint-core/camera';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { createSignal, For, Show } from 'solid-js';
import { FloatingBar, FloatingBarSeparator } from '../../shared/ui/FloatingBar';
import { placeBeside } from '../../shared/ui/placeBeside';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { SelectionTool, WandSettings } from './createSelection';
import styles from './Selection.module.css';
import { maxFeatherRadius } from './selectionEdit';

/**
 * Selection commands as an icon bar next to the selection, with an options row below it. The bar holds the selection
 * tools (lasso, polygon, rectangle, ellipse, magic wand), the fill and gradient tools, which work only inside a
 * selection, filling the whole selection with the color, then transform, copy, cut, paste, move to a new layer, delete
 * and deselect. The options row holds how a new shape combines with the selection, the magic wand's settings, and
 * Select All, Invert and Feather. Without a selection, a hint at the top of the canvas with the tools, Select All and
 * Paste. Keyboard shortcuts run the same commands.
 */
export function SelectionActions(props: {
  /** Corners of the selection's bounds in CSS pixels of the canvas; none for an inverted selection or none at all. */
  outline: readonly Point[] | undefined;
  /** Whether anything is selected. */
  selected: boolean;
  /** Size of the canvas in CSS pixels. */
  size: ViewSize;
  /** Commands are unavailable, for example before the engine is ready or during a selection gesture. */
  disabled: boolean;
  /** A selection change or pixel command is applying. */
  busy: boolean;
  /** Copied pixels are available to paste. */
  hasClipboard: boolean;
  onAction: (action: SelectionAction) => void;
  onTransform: () => void;
  onDeselect: () => void;
  onSelectAll: () => void;
  onInvert: () => void;
  /** Softens the selection's edges by a radius in document pixels. */
  onFeather: (radius: number) => void;
  /** The selection tool the next press uses. */
  selectionTool: SelectionTool;
  onSelectionTool: (tool: SelectionTool) => void;
  /** How a new shape combines with the selection. */
  mode: SelectionMode;
  onMode: (mode: SelectionMode) => void;
  wand: WandSettings;
  onWand: (patch: Partial<WandSettings>) => void;
  /** The tool working in the selection: drawing selections (`lasso`), the bucket fill or the gradient. */
  tool: 'lasso' | 'fill' | 'gradient';
  onTool: (tool: 'lasso' | 'fill' | 'gradient') => void;
  /** Fills the whole selection with the color, as one undo step. */
  onFillSelection: () => void;
}) {
  const [radius, setRadius] = createSignal(8);
  const unavailable = () => props.disabled || props.busy;
  const placement = () =>
    props.outline ? placeBeside(props.outline, props.size, barSize) : { left: props.size.width / 2, top: hintTop };
  const paste = () => (
    <button
      aria-label="Paste"
      title="Paste into the active layer · ⌘/Ctrl V"
      disabled={unavailable() || !props.hasClipboard}
      onClick={() => props.onAction('paste')}
    >
      <SketchIcon name="paste" size={20} />
    </button>
  );
  const tools = () => (
    <For each={toolButtons}>
      {(item) => (
        <button
          aria-label={item.label}
          title={item.title}
          aria-pressed={props.tool === 'lasso' && props.selectionTool === item.tool ? 'true' : 'false'}
          onClick={() => {
            props.onSelectionTool(item.tool);
            props.onTool('lasso');
          }}
        >
          <SketchIcon name={item.icon} size={20} />
        </button>
      )}
    </For>
  );
  const selectAll = () => (
    <button aria-label="Select all" title="Select all · ⌘/Ctrl A" disabled={unavailable()} onClick={props.onSelectAll}>
      <SketchIcon name="selectAll" size={20} />
    </button>
  );

  return (
    <>
      <Show
        when={props.selected}
        fallback={
          <FloatingBar placement={placement()} label="Selection actions">
            {tools()}
            <span role="status">{hint(props.busy, props.selectionTool)}</span>
            {selectAll()}
            <Show when={props.hasClipboard}>{paste()}</Show>
          </FloatingBar>
        }
      >
        <FloatingBar placement={placement()} label="Selection actions">
          {tools()}
          <FloatingBarSeparator />
          <button
            aria-label="Fill tool"
            title="Fill · G: click inside the selection to fill an area of similar color"
            aria-pressed={props.tool === 'fill' ? 'true' : 'false'}
            disabled={unavailable()}
            onClick={() => props.onTool(props.tool === 'fill' ? 'lasso' : 'fill')}
          >
            <SketchIcon name="fill" size={20} />
          </button>
          <button
            aria-label="Gradient tool"
            title="Gradient: drag inside the selection from where it starts to where it ends"
            aria-pressed={props.tool === 'gradient' ? 'true' : 'false'}
            disabled={unavailable()}
            onClick={() => props.onTool(props.tool === 'gradient' ? 'lasso' : 'gradient')}
          >
            <SketchIcon name="gradient" size={20} />
          </button>
          <button
            aria-label="Fill selection"
            title="Fill the whole selection with the color"
            disabled={unavailable()}
            onClick={() => props.onFillSelection()}
          >
            <SketchIcon name="fillSelection" size={20} />
          </button>
          <FloatingBarSeparator />
          <button
            aria-label="Transform selection"
            title="Transform the selected pixels · ⌘/Ctrl T"
            disabled={unavailable()}
            onClick={() => props.onTransform()}
          >
            <SketchIcon name="move" size={20} />
          </button>
          <FloatingBarSeparator />
          <button
            aria-label="Copy"
            title="Copy · ⌘/Ctrl C"
            disabled={unavailable()}
            onClick={() => props.onAction('copy')}
          >
            <SketchIcon name="copy" size={20} />
          </button>
          <button
            aria-label="Cut"
            title="Cut · ⌘/Ctrl X"
            disabled={unavailable()}
            onClick={() => props.onAction('cut')}
          >
            <SketchIcon name="cut" size={20} />
          </button>
          {paste()}
          <button
            aria-label="Move to new layer"
            title="Move the selected pixels to a new layer"
            disabled={unavailable()}
            onClick={() => props.onAction('new-layer')}
          >
            <SketchIcon name="newLayer" size={20} />
          </button>
          <button
            aria-label="Delete"
            title="Delete the selected pixels · Delete"
            disabled={unavailable()}
            onClick={() => props.onAction('delete')}
          >
            <SketchIcon name="trash" size={20} />
          </button>
          <FloatingBarSeparator />
          <button
            aria-label="Deselect"
            title="Deselect · ⌘/Ctrl D or Escape"
            disabled={unavailable()}
            onClick={() => props.onDeselect()}
          >
            <SketchIcon name="close" size={20} />
          </button>
        </FloatingBar>
      </Show>
      <Show when={props.tool === 'lasso'}>
        <FloatingBar
          placement={{ left: placement().left, top: placement().top + barHeight + optionsGap }}
          label="Selection options"
        >
          <For each={modeButtons}>
            {(item) => (
              <button
                aria-label={item.label}
                title={item.title}
                aria-pressed={props.mode === item.mode ? 'true' : 'false'}
                onClick={() => props.onMode(item.mode)}
              >
                <SketchIcon name={item.icon} size={20} />
              </button>
            )}
          </For>
          <Show when={props.selectionTool === 'wand'}>
            <FloatingBarSeparator />
            <label class={styles.field} title="How different a color may be from the pressed one and still be selected">
              Tolerance
              <input
                type="number"
                aria-label="Wand tolerance"
                min={0}
                max={255}
                value={props.wand.tolerance}
                onChange={(event) =>
                  props.onWand({ tolerance: clamp(Math.round(event.currentTarget.valueAsNumber), 0, 255, 32) })
                }
              />
            </label>
            <button
              class={styles.textOption}
              aria-pressed={props.wand.contiguous ? 'true' : 'false'}
              title="Select only the area connected to the pressed pixel"
              onClick={() => props.onWand({ contiguous: !props.wand.contiguous })}
            >
              Contiguous
            </button>
            <button
              class={styles.textOption}
              aria-pressed={props.wand.source === 'all' ? 'true' : 'false'}
              title="Compare the colors of all visible layers rather than the active layer's"
              onClick={() => props.onWand({ source: props.wand.source === 'all' ? 'layer' : 'all' })}
            >
              All layers
            </button>
            <button
              class={styles.textOption}
              aria-pressed={props.wand.antialias ? 'true' : 'false'}
              title="Soften the edge of the selected area by a pixel"
              onClick={() => props.onWand({ antialias: !props.wand.antialias })}
            >
              Smooth edges
            </button>
          </Show>
          <Show when={props.selected}>
            <FloatingBarSeparator />
            <button
              aria-label="Invert selection"
              title="Select what is not selected · ⌘/Ctrl Shift I"
              disabled={unavailable()}
              onClick={props.onInvert}
            >
              <SketchIcon name="selectInvert" size={20} />
            </button>
            <label class={styles.field} title="Soften the selection's edges by this many pixels">
              <input
                type="number"
                aria-label="Feather radius"
                min={1}
                max={maxFeatherRadius}
                value={radius()}
                onChange={(event) =>
                  setRadius(clamp(event.currentTarget.valueAsNumber, 0.5, maxFeatherRadius, radius()))
                }
              />
              px
            </label>
            <button
              aria-label="Feather selection"
              title="Feather: soften the selection's edges by the radius"
              disabled={unavailable()}
              onClick={() => props.onFeather(radius())}
            >
              <SketchIcon name="feather" size={20} />
            </button>
            {selectAll()}
          </Show>
        </FloatingBar>
      </Show>
    </>
  );
}

/** The hint shown without a selection. */
function hint(busy: boolean, tool: SelectionTool) {
  if (busy) {
    return 'Applying selection…';
  }

  return {
    lasso: 'Draw around pixels to select them.',
    polygon: 'Press corners around pixels; press the first again to close.',
    rectangle: 'Drag across pixels to select them.',
    ellipse: 'Drag across pixels to select them.',
    wand: 'Press a color to select the area of it.'
  }[tool];
}

/** `value` within `min` and `max`, or `fallback` when it is not a number. */
function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Top of the hint bar, below the view controls. */
const hintTop = 66;

/** Height of a bar, and the gap above the options row. */
const barHeight = 48;
const optionsGap = 6;

/** Approximate size of the bar and the options row below it, for placing them. */
const barSize = { width: 640, height: barHeight * 2 + optionsGap };

/** The selection tools, in bar order. */
const toolButtons: readonly { tool: SelectionTool; label: string; title: string; icon: SketchIconName }[] = [
  { tool: 'lasso', label: 'Lasso selection', title: 'Lasso · L: draw around the pixels', icon: 'lasso' },
  {
    tool: 'polygon',
    label: 'Polygon selection',
    title: 'Polygonal lasso: press corners; the first corner, a double press or Enter closes it',
    icon: 'selectPolygon'
  },
  { tool: 'rectangle', label: 'Rectangle selection', title: 'Rectangle: drag across the pixels', icon: 'selectRect' },
  { tool: 'ellipse', label: 'Ellipse selection', title: 'Ellipse: drag across the pixels', icon: 'selectEllipse' },
  { tool: 'wand', label: 'Magic wand', title: 'Magic wand · W: press a color to select it', icon: 'magicWand' }
];

/** How a new shape combines with the selection, in bar order. */
const modeButtons: readonly { mode: SelectionMode; label: string; title: string; icon: SketchIconName }[] = [
  { mode: 'replace', label: 'New selection', title: 'New selection', icon: 'selectNew' },
  { mode: 'add', label: 'Add to selection', title: 'Add to the selection · hold Shift', icon: 'selectAdd' },
  {
    mode: 'subtract',
    label: 'Subtract from selection',
    title: 'Subtract from the selection · hold Alt/Option',
    icon: 'selectSubtract'
  },
  {
    mode: 'intersect',
    label: 'Intersect with selection',
    title: 'Keep only where it overlaps the selection · hold Shift and Alt/Option',
    icon: 'selectIntersect'
  }
];
