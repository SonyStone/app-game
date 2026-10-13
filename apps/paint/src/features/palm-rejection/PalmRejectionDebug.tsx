import { For, Show } from 'solid-js';
import styles from './PalmRejection.module.css';
import type { createPalmRejection } from './createPalmRejection';

/** Shows the guarded area while the pen is near and a ring at each ignored touch, for tuning on a tablet. */
export function PalmRejectionDebug(props: { palm: ReturnType<typeof createPalmRejection> }) {
  return (
    <>
      <Show when={props.palm.zone()}>
        {(zone) => (
          <div class={styles.zone} style={{ left: `${zone().left}px`, width: `${zone().right - zone().left}px` }} />
        )}
      </Show>
      <For each={props.palm.ignored()}>
        {(touch) => <span class={styles.mark} style={{ left: `${touch.x}px`, top: `${touch.y}px` }} />}
      </For>
    </>
  );
}
