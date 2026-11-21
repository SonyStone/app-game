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
  /** Safe area of the board's view (inside any docked sidebars). */
  area: { left?: number; top?: number; width: number; height: number };
  /** A bar already lying in the place, such as the Edit bar, which this one moves under or over rather than behind. */
  avoid?: Rect;
  /** Whether the one selected part has looks to choose from. */
  looks: boolean;
  /** Whether the selection covers one whole non-owned panel that can be docked or undocked. */
  dock?: 'dock' | 'undock';
  /** Whether the selection was just kept as a kit, which the bar tells for a moment. */
  kept: boolean;
  onPutAway: () => void;
  onDuplicate: () => void;
  onKeep: () => void;
  /** Opens the look chooser beside the selected part. */
  onLooks: () => void;
  /** Docks or undocks the selected whole panel. */
  onToggleDock?: () => void;
}) {
  const [bar, setBar] = createSignal<HTMLElement>();
  const size = createElementSize(bar);
  const place = () => {
    const width = size.width ?? 0;
    const height = size.height ?? 0;
    const { rect, area } = props;
    const areaLeft = area.left ?? 0;
    const areaTop = area.top ?? 0;
    const left = Math.max(
      areaLeft + barGap,
      Math.min(rect.left + rect.width / 2 - width / 2, areaLeft + area.width - width - barGap)
    );
    const above = rect.top - height - barGap;
    const below = rect.top + rect.height + barGap;
    const top =
      above >= areaTop + barGap
        ? above
        : below + height <= areaTop + area.height - barGap
          ? below
          : Math.max(areaTop + barGap, Math.min(rect.top + barGap, areaTop + area.height - height - barGap));
    const avoid = props.avoid;
    const covered =
      avoid !== undefined &&
      left < avoid.left + avoid.width &&
      left + width > avoid.left &&
      top < avoid.top + avoid.height &&
      top + height > avoid.top;
    if (avoid && covered) {
      const under = avoid.top + avoid.height + barGap;
      return { left, top: under + height <= areaTop + area.height - barGap ? under : avoid.top - height - barGap };
    }

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
      <Show when={props.dock && props.onToggleDock}>
        <button type="button" onClick={() => props.onToggleDock?.()}>
          <SketchIcon name="pin" size={18} />
          {props.dock === 'undock' ? 'Undock' : 'Dock'}
        </button>
      </Show>
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
