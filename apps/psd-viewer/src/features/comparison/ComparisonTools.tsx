import type { PsdDifference } from '@app-game/psd/viewer';
import { createSignal, Show } from 'solid-js';
import styles from './comparison.module.css';
import type { ViewMode } from './createComparison';
import { nextMismatch } from './mismatches';

/** Describes both comparison states and provides keyboard-operable wipe/mismatch navigation. */
export function ComparisonTools(props: {
  view: ViewMode;
  state: string;
  overrides: number;
  difference: PsdDifference | undefined;
  wipe: number;
  onWipe: (percent: number) => void;
  onMismatch: (point: { x: number; y: number }) => void;
}) {
  const [position, setPosition] = createSignal(() => {
    props.difference;
    return -1;
  });
  function move(direction: 1 | -1) {
    const diff = props.difference;
    if (!diff) {
      return;
    }

    const index = nextMismatch(diff, position() < 0 && direction === -1 ? 0 : position(), direction);
    if (index !== undefined) {
      setPosition(index);
      props.onMismatch({ x: index % diff.width, y: Math.floor(index / diff.width) });
    }
  }

  return (
    <div class={styles.tools} aria-label="Comparison controls">
      <p style={{ margin: '2px 0' }}>
        Current: {props.state}, {props.overrides} transient visibility overrides, current render settings. Reference:
        Photoshop's saved merged composite, which may be stale.{' '}
        {props.view === 'blink'
          ? 'Blink alternates every 600 ms. Choose Our render to stop.'
          : 'Current on left, saved on right in split/wipe.'}
      </p>
      <Show when={props.view === 'wipe'}>
        <label>
          Wipe position{' '}
          <input
            aria-label="Wipe position"
            type="range"
            min="0"
            max="100"
            value={props.wipe}
            onInput={(event) => props.onWipe(Number(event.currentTarget.value))}
          />
        </label>
      </Show>
      <button disabled={!props.difference?.differingPixels} onClick={() => move(-1)}>
        Previous mismatch
      </button>
      <button disabled={!props.difference?.differingPixels} onClick={() => move(1)}>
        Next mismatch
      </button>
      <span aria-live="polite">
        {position() >= 0 && props.difference
          ? ` ${position() % props.difference.width}, ${Math.floor(position() / props.difference.width)}`
          : ''}
      </span>
    </div>
  );
}
