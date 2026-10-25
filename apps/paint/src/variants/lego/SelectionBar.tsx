import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Rect } from './board';
import styles from './LegoStudio.module.css';

/**
 * What can be done with the parts selected while editing, floating above their outline (below it when there is no
 * room above), kept inside the place: put them away, duplicate them beside themselves, keep them as a kit, and for
 * one part with several looks, choose its look. Its presses never reach the board under it.
 */
export function SelectionBar(props: {
  /** The selection's outline, in the pixels of the place it lies in. */
  rect: Rect;
  /** The size of that place, the board's view or the workbench. */
  area: { width: number; height: number };
  /** Whether the one selected part has looks to choose from. */
  looks: boolean;
  /** Whether the selection was just kept as a kit, which the bar tells for a moment. */
  kept: boolean;
  onPutAway: () => void;
  onDuplicate: () => void;
  onKeep: () => void;
  /** Opens the look chooser beside the selected part. */
  onLooks: () => void;
}) {
  const [bar, setBar] = createSignal<HTMLElement>();
  const size = createElementSize(bar);
  const place = () => {
    const width = size.width ?? 0;
    const height = size.height ?? 0;
    const { rect, area } = props;
    const left = Math.max(barGap, Math.min(rect.left + rect.width / 2 - width / 2, area.width - width - barGap));
    const above = rect.top - height - barGap;
    const below = rect.top + rect.height + barGap;
    const top = above >= barGap ? above : below + height <= area.height - barGap ? below : rect.top + barGap;
    return { left, top };
  };

  return (
    <div
      ref={setBar}
      class={styles.selectionBar}
      role="toolbar"
      aria-label="Selected parts"
      data-keeps-panel
      style={{
        left: `${place().left}px`,
        top: `${place().top}px`,
        visibility: size.width ? undefined : 'hidden'
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => props.onPutAway()}>
        <SketchIcon name="close" size={18} />
        Put away
      </button>
      <button type="button" onClick={() => props.onDuplicate()}>
        <SketchIcon name="plus" size={18} />
        Duplicate
      </button>
      <button type="button" data-done={props.kept ? '' : undefined} onClick={() => props.onKeep()}>
        <SketchIcon name={props.kept ? 'check' : 'tools'} size={18} />
        {props.kept ? 'Kept' : 'Keep as kit'}
      </button>
      <Show when={props.looks}>
        <button type="button" onClick={() => props.onLooks()}>
          <span class={styles.looksGlyph} aria-hidden="true">
            ⇄
          </span>
          Look
        </button>
      </Show>
    </div>
  );
}

/** CSS pixels between the bar and the selection's outline, and the least room it keeps above or below. */
const barGap = 10;
