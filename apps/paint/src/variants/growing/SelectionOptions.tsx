import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { For } from 'solid-js';
import type { SelectionTool } from '../../features/selection';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './panels.module.css';

/**
 * The selection's options beside the dock while the selection tool is active, in the dock's two-column grid: the
 * drawn shapes (freehand, polygon, rectangle, ellipse); the magic wand and Select all, which select by content;
 * Add and Remove, which make the next shape add to or cut from the selection (tap again for a new selection); and
 * Invert and Deselect.
 */
export function SelectionOptions(props: {
  tool: SelectionTool;
  onTool: (tool: SelectionTool) => void;
  mode: SelectionMode;
  onMode: (mode: SelectionMode) => void;
  /** Whether anything is selected. */
  selected: boolean;
  /** Commands wait, for example while a selection is drawn or applied. */
  disabled: boolean;
  onSelectAll: () => void;
  onInvert: () => void;
  onClear: () => void;
}) {
  const toggleMode = (mode: SelectionMode) => props.onMode(props.mode === mode ? 'replace' : mode);

  return (
    <>
      <h2 class={styles.gridTitle}>Select</h2>
      <div class={styles.grid} role="radiogroup" aria-label="Selection shape">
        <For each={shapes}>
          {(shape) => (
            <button
              class={styles.gridButton}
              role="radio"
              aria-checked={props.tool === shape.tool ? 'true' : 'false'}
              aria-label={shape.label}
              title={shape.label}
              onClick={() => props.onTool(shape.tool)}
            >
              <SketchIcon name={shape.icon} size={20} />
            </button>
          )}
        </For>
      </div>
      <div class={styles.grid}>
        <button
          class={styles.gridButton}
          aria-pressed={props.tool === 'wand' ? 'true' : 'false'}
          aria-label="Magic wand"
          title="Magic wand · W · tap an area of one color"
          onClick={() => props.onTool('wand')}
        >
          <SketchIcon name="magicWand" size={20} />
        </button>
        <button
          class={styles.gridButton}
          aria-label="Select all"
          title="Select all · Ctrl+A"
          disabled={props.disabled}
          onClick={() => props.onSelectAll()}
        >
          <SketchIcon name="selectAll" size={20} />
        </button>
        <button
          class={styles.gridButton}
          aria-pressed={props.mode === 'add' ? 'true' : 'false'}
          aria-label="Add"
          title="Add: the next shape adds to the selection · tap again for a new one"
          onClick={() => toggleMode('add')}
        >
          <SketchIcon name="selectAdd" size={20} />
        </button>
        <button
          class={styles.gridButton}
          aria-pressed={props.mode === 'subtract' ? 'true' : 'false'}
          aria-label="Remove"
          title="Remove: the next shape cuts from the selection · tap again for a new one"
          onClick={() => toggleMode('subtract')}
        >
          <SketchIcon name="selectSubtract" size={20} />
        </button>
      </div>
      <div class={styles.grid}>
        <button
          class={styles.gridButton}
          aria-label="Invert"
          title="Invert · Ctrl+Shift+I"
          disabled={props.disabled}
          onClick={() => props.onInvert()}
        >
          <SketchIcon name="selectInvert" size={20} />
        </button>
        <button
          class={styles.gridButton}
          aria-label="Deselect"
          title="Deselect · Ctrl+D"
          disabled={props.disabled || !props.selected}
          onClick={() => props.onClear()}
        >
          <SketchIcon name="close" size={20} />
        </button>
      </div>
    </>
  );
}

const shapes: { tool: SelectionTool; label: string; icon: SketchIconName }[] = [
  { tool: 'lasso', label: 'Freehand', icon: 'lasso' },
  { tool: 'polygon', label: 'Polygon · Enter closes', icon: 'selectPolygon' },
  { tool: 'rectangle', label: 'Rectangle', icon: 'selectRect' },
  { tool: 'ellipse', label: 'Ellipse', icon: 'selectEllipse' }
];
