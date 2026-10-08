import type { PsdTextSupport } from '@app-game/psd/viewer';
import { Show } from 'solid-js';
import styles from './fonts.module.css';

/**
 * Whether a type layer re-renders from its text with the library's fonts, as "Re-render text" would draw it, and the
 * renderer's reason when it does not, such as a missing font or a setting Photoshop's research has not verified.
 */
export function TextSupportSection(props: { support: PsdTextSupport }) {
  return (
    <section
      class={styles.support}
      aria-label="Text re-rendering"
      data-text-support={props.support.supported ? 'supported' : 'refused'}
    >
      <h3>Re-rendering from text</h3>
      <p>
        <Show when={props.support.supported} fallback={<>Not re-rendered exactly: {props.support.reason}</>}>
          Re-renders exactly from its text with the library's fonts.
        </Show>
      </p>
      <Show when={props.support.missing.length}>
        <p>Missing fonts: {props.support.missing.join(', ')}</p>
      </Show>
    </section>
  );
}
