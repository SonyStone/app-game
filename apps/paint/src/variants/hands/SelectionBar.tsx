import type { SelectionAction } from '@app-game/paint-core/protocol';
import { For, Show } from 'solid-js';
import type { SelectionTool } from '../../features/selection';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './SelectionBar.module.css';

/**
 * A small bar at the top of the drawing while the lasso is the pen's mode or something is selected: the selection
 * kinds while lassoing, then the commands on the selection (invert, fill with the color, cut, copy, paste, transform,
 * deselect).
 */
export function SelectionBar(props: {
  /** The lasso is the pen's mode: the selection kinds show. */
  lassoing: boolean;
  tool: SelectionTool;
  onTool: (tool: SelectionTool) => void;
  selected: boolean;
  hasClipboard: boolean;
  /** Commands wait, for example while a selection is being drawn or applied. */
  disabled: boolean;
  onAction: (action: SelectionAction) => void;
  onInvert: () => void;
  onFill: () => void;
  onTransform: () => void;
  onDeselect: () => void;
}) {
  return (
    <div class={styles.bar} data-hands-ui role="toolbar" aria-label="Selection">
      <Show when={props.lassoing}>
        <div class={styles.group} role="radiogroup" aria-label="Selection kind">
          <For each={kinds}>
            {(kind) => (
              <button
                class={styles.button}
                role="radio"
                aria-checked={props.tool === kind[0] ? 'true' : 'false'}
                aria-label={kind[2]}
                title={kind[2]}
                onClick={() => props.onTool(kind[0])}
              >
                <SketchIcon name={kind[1]} size={20} />
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class={styles.group}>
        <Button icon="selectInvert" label="Invert" disabled={props.disabled} onClick={props.onInvert} />
        <Show when={props.selected}>
          <Button icon="fillSelection" label="Fill with the color" disabled={props.disabled} onClick={props.onFill} />
          <Button icon="cut" label="Cut" disabled={props.disabled} onClick={() => props.onAction('cut')} />
          <Button icon="copy" label="Copy" disabled={props.disabled} onClick={() => props.onAction('copy')} />
        </Show>
        <Show when={props.hasClipboard}>
          <Button icon="paste" label="Paste" disabled={props.disabled} onClick={() => props.onAction('paste')} />
        </Show>
        <Show when={props.selected}>
          <Button icon="distort" label="Transform" disabled={props.disabled} onClick={props.onTransform} />
          <Button icon="close" label="Deselect" disabled={props.disabled} onClick={props.onDeselect} />
        </Show>
      </div>
    </div>
  );
}

function Button(props: { icon: SketchIconName; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      class={styles.button}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={20} />
    </button>
  );
}

/** Selection kinds: the tool, its icon and its name. */
const kinds: readonly (readonly [SelectionTool, SketchIconName, string])[] = [
  ['lasso', 'lasso', 'Freehand'],
  ['polygon', 'selectPolygon', 'Polygon'],
  ['rectangle', 'selectRect', 'Rectangle'],
  ['ellipse', 'selectEllipse', 'Ellipse'],
  ['wand', 'magicWand', 'Magic wand']
];
