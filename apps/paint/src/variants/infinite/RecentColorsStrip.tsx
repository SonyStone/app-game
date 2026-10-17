import { createSignal, For, Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './RecentColorsStrip.module.css';

/**
 * Infinite Painter's Recent Colors strip, docked beside the main toolbar: a narrow column of the color history, newest
 * at the top, in {@link historyLimit} equal segments over `height` CSS pixels (empty segments stay dark). A press on
 * the strip shows the segment's color in a large floating round swatch beside it; dragging up and down previews the
 * other colors, and lifting calls `onPick` with the color under the finger. A cancelled press picks nothing.
 *
 * Keep the history short of near-duplicates with `mergeSimilar` from `features/color/mergeSimilar`, as the app's
 * "smart color selection" does.
 */
export function RecentColorsStrip(props: {
  /** The color history, newest first; the first {@link historyLimit} show. */
  colors: readonly string[];
  /** The strip's height in CSS pixels: the main toolbar's. */
  height: number;
  onPick: (color: string) => void;
  /** Which side of the strip the floating swatch shows on; `right` by default, as beside a toolbar at the left. */
  side?: 'left' | 'right';
}) {
  /** The segment under the press in progress, if a press shows a color. */
  const [previewed, setPreviewed] = createSignal<number>();
  const shown = () => props.colors.slice(0, historyLimit);
  const segment = () => props.height / historyLimit;
  /** The segment under the press, limited to the segments that hold a color. */
  const indexAt = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const index = Math.floor(((press.point.y - rect.top) / rect.height) * historyLimit);
    return Math.min(shown().length - 1, Math.max(0, index));
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: (started) => {
      if (shown().length === 0) {
        return false;
      }

      setPreviewed(indexAt(started));
    },
    move: (moved) => setPreviewed(indexAt(moved)),
    end: (ended) => {
      setPreviewed(undefined);
      const color = shown()[indexAt(ended)];
      if (color) {
        props.onPick(color);
      }
    },
    cancel: () => setPreviewed(undefined)
  });
  const previewColor = () => {
    const index = previewed();
    return index === undefined ? undefined : shown()[index];
  };

  return (
    <div class={styles.strip} style={{ height: `${props.height}px` }} data-side={props.side ?? 'right'}>
      <div class={styles.hitArea} role="listbox" aria-label="Recent colors" {...press}>
        <For each={Array.from({ length: historyLimit }, (_, index) => index)}>
          {(index) => (
            <span
              class={styles.segment}
              role="option"
              aria-label={shown()[index] ?? 'Empty'}
              aria-selected={previewed() === index ? 'true' : 'false'}
              style={{ height: `${segment()}px`, background: shown()[index] }}
            />
          )}
        </For>
      </div>
      <Show when={previewColor()}>
        {(color) => (
          <span
            class={styles.preview}
            style={{ top: `${(previewed()! + 0.5) * segment()}px`, background: color() }}
            aria-hidden="true"
          />
        )}
      </Show>
    </div>
  );
}

/** How many colors the history keeps and the strip shows, as in Infinite Painter. */
export const historyLimit = 10;
