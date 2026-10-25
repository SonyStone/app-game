import type { JSX } from '@solidjs/web';
import { Errored } from 'solid-js';
import styles from './LegoStudio.module.css';

/** Isolates one part or popup region while its host keeps layout, dragging and removal available. */
export function PartFrame(props: { kind?: string; children: JSX.Element }) {
  return (
    <Errored
      fallback={(_error, reset) => (
        <button
          type="button"
          class={styles.brokenPart}
          title={`${props.kind ?? 'Part'} failed. Tap to retry.`}
          onClick={reset}
        >
          <span>Broken part</span>
          <span>{props.kind}</span>
          <span>Retry</span>
        </button>
      )}
    >
      {props.children}
    </Errored>
  );
}

/** Retains a tile for an unavailable kind or malformed stored record. */
export function MissingPart(props: { kind: string }) {
  return (
    <span
      class={styles.brokenPart}
      role="img"
      aria-label={`Missing part: ${props.kind}`}
      title={`Missing part: ${props.kind}`}
    >
      ?<span>{props.kind}</span>
    </span>
  );
}
