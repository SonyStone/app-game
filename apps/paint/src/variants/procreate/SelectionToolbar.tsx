import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { createSignal, For, Show } from 'solid-js';
import { maxFeatherRadius, type SelectionTool, type WandSettings } from '../../features/selection';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './SelectionToolbar.module.css';
import { Slider } from './Slider';

/**
 * Procreate's selection toolbar along the bottom of the screen while Selection is active: the selection kinds
 * (Automatic is the magic wand, Freehand the lasso, then polygon, rectangle and ellipse), then Add and Remove, which
 * make the next shape add to or cut from the selection (tap again for a new selection), Invert, Feather, Color Fill
 * (fills the selection with the current color) and Clear (deselects). Feather and the Automatic threshold open a
 * slider row above the toolbar.
 */
export function SelectionToolbar(props: {
  tool: SelectionTool;
  onTool: (tool: SelectionTool) => void;
  mode: SelectionMode;
  onMode: (mode: SelectionMode) => void;
  /** Whether anything is selected. */
  selected: boolean;
  /** Commands wait, for example while a selection is being drawn or applied. */
  disabled: boolean;
  wand: WandSettings;
  onWand: (patch: Partial<WandSettings>) => void;
  onInvert: () => void;
  /** Softens the selection's edges by a radius in document pixels. */
  onFeather: (radius: number) => void;
  onColorFill: () => void;
  onClear: () => void;
}) {
  const [feathering, setFeathering] = createSignal(false);
  const [radius, setRadius] = createSignal(8);
  const toggleMode = (mode: SelectionMode) => props.onMode(props.mode === mode ? 'replace' : mode);

  return (
    <div class={styles.dock}>
      <Show when={props.tool === 'wand' && !feathering()}>
        <div class={styles.options} role="group" aria-label="Automatic selection threshold">
          <span>Threshold</span>
          <Slider
            label="Selection threshold"
            min={0}
            max={255}
            value={props.wand.tolerance}
            valueText={`${Math.round((props.wand.tolerance / 255) * 100)} %`}
            onInput={(tolerance) => props.onWand({ tolerance: Math.round(tolerance) })}
            onChange={(tolerance) => props.onWand({ tolerance: Math.round(tolerance) })}
          />
          <output>{Math.round((props.wand.tolerance / 255) * 100)}%</output>
        </div>
      </Show>
      <Show when={feathering()}>
        <div class={styles.options} role="group" aria-label="Feather">
          <span>Feather</span>
          <Slider
            label="Feather radius"
            min={1}
            max={maxFeatherRadius / 2}
            value={radius()}
            valueText={`${Math.round(radius())} px`}
            onInput={setRadius}
            onChange={setRadius}
          />
          <output>{Math.round(radius())} px</output>
          <button
            class={styles.apply}
            disabled={props.disabled || !props.selected}
            onClick={() => {
              props.onFeather(Math.round(radius()));
              setFeathering(false);
            }}
          >
            Apply
          </button>
        </div>
      </Show>
      <div class={styles.toolbar} role="toolbar" aria-label="Selection">
        <For each={kinds}>
          {(kind) => (
            <button
              class={styles.item}
              aria-pressed={props.tool === kind.tool ? 'true' : 'false'}
              onClick={() => props.onTool(kind.tool)}
            >
              <SketchIcon name={kind.icon} size={22} />
              <span>{kind.label}</span>
            </button>
          )}
        </For>
        <span class={styles.separator} />
        <button
          class={styles.item}
          aria-pressed={props.mode === 'add' ? 'true' : 'false'}
          onClick={() => toggleMode('add')}
        >
          <SketchIcon name="selectAdd" size={22} />
          <span>Add</span>
        </button>
        <button
          class={styles.item}
          aria-pressed={props.mode === 'subtract' ? 'true' : 'false'}
          onClick={() => toggleMode('subtract')}
        >
          <SketchIcon name="selectSubtract" size={22} />
          <span>Remove</span>
        </button>
        <button class={styles.item} disabled={props.disabled} onClick={() => props.onInvert()}>
          <SketchIcon name="selectInvert" size={22} />
          <span>Invert</span>
        </button>
        <button
          class={styles.item}
          aria-pressed={feathering() ? 'true' : 'false'}
          disabled={props.disabled || !props.selected}
          onClick={() => setFeathering(!feathering())}
        >
          <SketchIcon name="feather" size={22} />
          <span>Feather</span>
        </button>
        <button class={styles.item} disabled={props.disabled || !props.selected} onClick={() => props.onColorFill()}>
          <SketchIcon name="fillSelection" size={22} />
          <span>Color Fill</span>
        </button>
        <button
          class={styles.item}
          disabled={props.disabled || !props.selected}
          onClick={() => {
            setFeathering(false);
            props.onClear();
          }}
        >
          <SketchIcon name="close" size={22} />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
}

const kinds: { tool: SelectionTool; label: string; icon: SketchIconName }[] = [
  { tool: 'wand', label: 'Automatic', icon: 'magicWand' },
  { tool: 'lasso', label: 'Freehand', icon: 'lasso' },
  { tool: 'polygon', label: 'Polygon', icon: 'selectPolygon' },
  { tool: 'rectangle', label: 'Rectangle', icon: 'selectRect' },
  { tool: 'ellipse', label: 'Ellipse', icon: 'selectEllipse' }
];
