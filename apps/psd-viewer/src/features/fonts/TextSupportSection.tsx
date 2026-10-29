import type { PsdTextSupport } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import styles from './fonts.module.css';

/**
 * Whether a type layer re-renders from its text with the library's fonts, as "Re-render text" would draw it, and the
 * renderer's reason when it does not, including supplied release mismatches with their version evidence.
 */
export function TextSupportSection(props: { support: PsdTextSupport }) {
  const exact = () => props.support.supported && !props.support.releaseMismatches.length;

  return (
    <section
      class={styles.support}
      aria-label="Text re-rendering"
      data-text-support={exact() ? 'supported' : 'refused'}
    >
      <h3>Re-rendering from text</h3>
      <p>
        <Show
          when={props.support.releaseMismatches.length}
          fallback={
            <Show when={exact()} fallback={<>Not re-rendered exactly: {props.support.reason}</>}>
              Re-renders exactly from its text with the library's fonts.
            </Show>
          }
        >
          font present, different release — text not exact
        </Show>
      </p>
      <For each={props.support.releaseMismatches}>
        {(font) => (
          <p>
            {font.name}: recorded {font.recordedVersion}; supplied {font.suppliedVersion ?? 'version unknown'}.
          </p>
        )}
      </For>
      <Show when={props.support.missing.length}>
        <p>Missing fonts: {props.support.missing.join(', ')}</p>
      </Show>
    </section>
  );
}
