import type { JSX } from '@solidjs/web';
import { Errored, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Span } from './board';
import styles from './LegoStudio.module.css';

/**
 * Isolates one part or popup region while its host keeps layout, dragging and removal available.
 * Uses a retry icon below two columns; omit `span` for popup regions that show the full failure text.
 */
export function PartFrame(props: { kind?: string; span?: Span; children: JSX.Element }) {
  return (
    <Errored
      fallback={(_error, reset) => (
        <button
          type="button"
          class={styles.brokenPart}
          aria-label={`Broken part: ${props.kind ?? 'Part'}. Retry`}
          title={`${props.kind ?? 'Part'} failed. Tap to retry.`}
          onClick={reset}
        >
          <Show when={!props.span || props.span.columns >= 2} fallback={<SketchIcon name="reset" />}>
            <span>Broken part</span>
            <span>{props.kind}</span>
            <span>Retry</span>
          </Show>
        </button>
      )}
    >
      {props.children}
    </Errored>
  );
}

/** Retains a tile for an unavailable kind or malformed stored record. */
export function MissingPart(props: { kind: string; span?: Span }) {
  return (
    <span
      class={styles.brokenPart}
      role="img"
      aria-label={`Missing part: ${props.kind}`}
      title={`Missing part: ${props.kind}`}
    >
      ?
      <Show when={!props.span || props.span.columns >= 2}>
        <span>{props.kind}</span>
      </Show>
    </span>
  );
}
