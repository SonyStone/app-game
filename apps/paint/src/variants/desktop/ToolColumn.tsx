import { For } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { SwapIcon } from './controls';
import type { DesktopTool } from './createDesktopTools';
import styles from './ToolColumn.module.css';

/**
 * Photoshop's tool column: one button per tool, the active one lighter, and the foreground and background colors at
 * the bottom, the foreground over the background, with Swap (X) and Default colors (D). Pressing a color swatch
 * edits that color in the Color panel.
 */
export function ToolColumn(props: {
  active: DesktopTool;
  /** The fill and the gradient select everything first when nothing is selected. */
  selected: boolean;
  foreground: string;
  background: string;
  /** The color the Color panel edits. */
  editing: 'color' | 'backgroundColor';
  onChoose: (tool: DesktopTool) => void;
  onEditColor: (which: 'color' | 'backgroundColor') => void;
  onSwap: () => void;
  onReset: () => void;
}) {
  return (
    <nav class={styles.column} aria-label="Tools">
      <For each={toolButtons}>
        {(button) => (
          <button
            class={styles.tool}
            aria-label={button.label}
            title={`${button.label} (${button.keys})${
              (button.tool === 'fill' || button.tool === 'gradient') && !props.selected
                ? ' · selects all first; works inside the selection'
                : ''
            }`}
            aria-pressed={props.active === button.tool ? 'true' : 'false'}
            onClick={() => props.onChoose(button.tool)}
          >
            <SketchIcon name={button.icon} size={20} />
          </button>
        )}
      </For>
      <div class={styles.colors}>
        <button
          class={[styles.swatch, styles.background]}
          style={{ background: props.background }}
          aria-label="Background color"
          title="Background color: edit in the Color panel"
          aria-pressed={props.editing === 'backgroundColor' ? 'true' : 'false'}
          onClick={() => props.onEditColor('backgroundColor')}
        />
        <button
          class={[styles.swatch, styles.foreground]}
          style={{ background: props.foreground }}
          aria-label="Foreground color"
          title="Foreground color: edit in the Color panel"
          aria-pressed={props.editing === 'color' ? 'true' : 'false'}
          onClick={() => props.onEditColor('color')}
        />
        <button class={styles.swap} aria-label="Swap colors" title="Swap colors (X)" onClick={() => props.onSwap()}>
          <SwapIcon />
        </button>
        <button
          class={styles.reset}
          aria-label="Default colors"
          title="Default colors: black and white (D)"
          onClick={() => props.onReset()}
        >
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}

/** The column's tool buttons, top to bottom, with their shortcut. */
const toolButtons: readonly { tool: DesktopTool; label: string; icon: SketchIconName; keys: string }[] = [
  { tool: 'brush', label: 'Brush', icon: 'draw', keys: 'B' },
  { tool: 'eraser', label: 'Eraser', icon: 'erase', keys: 'E' },
  { tool: 'select', label: 'Selection: lasso, shapes, magic wand', icon: 'lasso', keys: 'L, W' },
  { tool: 'fill', label: 'Fill', icon: 'fill', keys: 'G' },
  { tool: 'gradient', label: 'Gradient', icon: 'gradient', keys: 'Shift+G' },
  { tool: 'transform', label: 'Transform', icon: 'move', keys: 'Ctrl+T' },
  {
    tool: 'eyedropper',
    label: 'Eyedropper: picks once, then back to the tool',
    icon: 'picker',
    keys: 'I, or hold Alt'
  },
  { tool: 'view', label: 'Hand, zoom and rotate view', icon: 'pan', keys: 'H, Z, R' }
];
