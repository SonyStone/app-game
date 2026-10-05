import type { Point, ViewSize } from '@app-game/paint-core/camera';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { createSignal, For, Show } from 'solid-js';
import { FloatingBar, FloatingBarSeparator } from '../../shared/ui/FloatingBar';
import { Flyout, FlyoutItem } from '../../shared/ui/Flyout';
import { placeBeside } from '../../shared/ui/placeBeside';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { SelectionTool, WandSettings } from './createSelection';
import styles from './Selection.module.css';
import { maxFeatherRadius } from './selectionEdit';

/**
 * Selection commands as one icon bar next to the selection. Menus hold the choices and rarely used commands: the
 * selection tool (lasso, polygon, rectangle, ellipse, magic wand) and how a new selection combines (new, add, subtract,
 * intersect), each showing the current choice; Edit (copy, cut, paste, move to a new layer, delete, fill with the
 * color) and Modify (invert, feather by a dragged radius, select all). The fill and gradient tools, which work only
 * inside a selection, transform and deselect stay on the bar. Without a selection, a hint at the top of the canvas with
 * the tool and mode menus, Select All and Paste. The magic wand's settings show in a row below. Keyboard shortcuts run
 * the same commands.
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
  const current = () => toolChoices.find((item) => item.tool === props.selectionTool)!;
  const currentMode = () => modeChoices.find((item) => item.mode === props.mode)!;
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
  // How the next selection is drawn and how it combines, chosen from their menus.
  const choices = () => (
    <>
      <Flyout
        label="Selection tool"
        title={`Selection tool: ${current().label}`}
        face={<SketchIcon name={current().icon} size={20} />}
      >
        {(close) => (
          <For each={toolChoices}>
            {(item) => (
              <FlyoutItem
                icon={item.icon}
                label={item.label}
                shortcut={item.shortcut}
                checked={props.tool === 'lasso' && props.selectionTool === item.tool}
                onClick={() => {
                  props.onSelectionTool(item.tool);
                  props.onTool('lasso');
                  close();
                }}
              />
            )}
          </For>
        )}
      </Flyout>
      <Flyout
        label="Selection mode"
        title={`How a new selection combines: ${currentMode().label}`}
        face={<SketchIcon name={currentMode().icon} size={20} />}
      >
        {(close) => (
          <For each={modeChoices}>
            {(item) => (
              <FlyoutItem
                icon={item.icon}
                label={item.label}
                shortcut={item.shortcut}
                checked={props.mode === item.mode}
                onClick={() => {
                  props.onMode(item.mode);
                  close();
                }}
              />
            )}
          </For>
        )}
      </Flyout>
    </>
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
            {choices()}
            <span role="status">{hint(props.busy, props.selectionTool)}</span>
            {selectAll()}
            <Show when={props.hasClipboard}>{paste()}</Show>
          </FloatingBar>
        }
      >
        <FloatingBar placement={placement()} label="Selection actions">
          {choices()}
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
            aria-label="Transform selection"
            title="Transform the selected pixels · ⌘/Ctrl T"
            disabled={unavailable()}
            onClick={() => props.onTransform()}
          >
            <SketchIcon name="move" size={20} />
          </button>
          <FloatingBarSeparator />
          <Flyout
            label="Edit selected pixels"
            title="Copy, cut, paste, move to a new layer, delete or fill the selected pixels"
            face={<SketchIcon name="copy" size={20} />}
            disabled={unavailable()}
          >
            {(close) => (
              <For each={editItems}>
                {(item) => (
                  <FlyoutItem
                    icon={item.icon}
                    label={item.label}
                    shortcut={item.shortcut}
                    disabled={item.action === 'paste' && !props.hasClipboard}
                    onClick={() => {
                      close();
                      if (item.action === 'fill') {
                        props.onFillSelection();
                      } else {
                        props.onAction(item.action);
                      }
                    }}
                  />
                )}
              </For>
            )}
          </Flyout>
          <Flyout
            label="Modify selection"
            title="Invert, feather or select all"
            face={<SketchIcon name="feather" size={20} />}
            disabled={unavailable()}
          >
            {(close) => (
              <>
                <FlyoutItem
                  icon="selectInvert"
                  label="Invert selection"
                  shortcut="⌘⇧I"
                  onClick={() => {
                    close();
                    props.onInvert();
                  }}
                />
                <div class={styles.featherRow}>
                  <span>Radius</span>
                  <ScrubNumber
                    label="Feather radius"
                    min={0.5}
                    max={maxFeatherRadius}
                    step={0.5}
                    scale="log"
                    unit="px"
                    value={radius()}
                    onChange={setRadius}
                  />
                </div>
                <FlyoutItem
                  icon="feather"
                  label="Feather selection"
                  onClick={() => {
                    close();
                    props.onFeather(radius());
                  }}
                />
                <FlyoutItem
                  icon="selectAll"
                  label="Select all"
                  shortcut="⌘A"
                  onClick={() => {
                    close();
                    props.onSelectAll();
                  }}
                />
              </>
            )}
          </Flyout>
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
      <Show when={props.tool === 'lasso' && props.selectionTool === 'wand'}>
        <FloatingBar
          placement={{ left: placement().left, top: placement().top + barHeight + optionsGap }}
          label="Wand options"
        >
          <label class={styles.field} title="How different a color may be from the pressed one and still be selected">
            Tolerance
            <ScrubNumber
              label="Wand tolerance"
              min={0}
              max={255}
              value={props.wand.tolerance}
              onChange={(tolerance) => props.onWand({ tolerance })}
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

/** Top of the hint bar, below the view controls. */
const hintTop = 66;

/** Height of a bar, and the gap above the options row. */
const barHeight = 48;
const optionsGap = 6;

/** Approximate size of the bar and the wand's options row below it, for placing them. */
const barSize = { width: 440, height: barHeight * 2 + optionsGap };

/** The selection tools, in menu order. */
const toolChoices: readonly { tool: SelectionTool; label: string; shortcut?: string; icon: SketchIconName }[] = [
  { tool: 'lasso', label: 'Lasso selection', shortcut: 'L', icon: 'lasso' },
  { tool: 'polygon', label: 'Polygon selection', icon: 'selectPolygon' },
  { tool: 'rectangle', label: 'Rectangle selection', icon: 'selectRect' },
  { tool: 'ellipse', label: 'Ellipse selection', icon: 'selectEllipse' },
  { tool: 'wand', label: 'Magic wand', shortcut: 'W', icon: 'magicWand' }
];

/** How a new shape combines with the selection, in menu order. */
const modeChoices: readonly { mode: SelectionMode; label: string; shortcut?: string; icon: SketchIconName }[] = [
  { mode: 'replace', label: 'New selection', icon: 'selectNew' },
  { mode: 'add', label: 'Add to selection', shortcut: 'Shift', icon: 'selectAdd' },
  { mode: 'subtract', label: 'Subtract from selection', shortcut: 'Alt', icon: 'selectSubtract' },
  { mode: 'intersect', label: 'Intersect with selection', shortcut: 'Shift Alt', icon: 'selectIntersect' }
];

/** Commands on the selected pixels in the Edit menu. */
const editItems: readonly {
  action: SelectionAction | 'fill';
  label: string;
  shortcut?: string;
  icon: SketchIconName;
}[] = [
  { action: 'copy', label: 'Copy', shortcut: '⌘C', icon: 'copy' },
  { action: 'cut', label: 'Cut', shortcut: '⌘X', icon: 'cut' },
  { action: 'paste', label: 'Paste', shortcut: '⌘V', icon: 'paste' },
  { action: 'new-layer', label: 'Move to new layer', icon: 'newLayer' },
  { action: 'delete', label: 'Delete', shortcut: 'Del', icon: 'trash' },
  { action: 'fill', label: 'Fill selection', icon: 'fillSelection' }
];
