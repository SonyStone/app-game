import type { PsdOpening } from '@app-game/psd/viewer';
import { For, Show } from 'solid-js';
import styles from './openLikePhotoshop.module.css';

/**
 * How the open document was read, when it is not simply the strict reading Photoshop opens alike: the prompts and
 * alerts Photoshop shows with the answers given, what Photoshop's interpretation repaired, why the strict reader could
 * not read the file, or that Photoshop refuses a file shown as the strict reader reads it.
 */
export function OpeningReport(props: { opening: PsdOpening }) {
  const shown = () => props.opening.reader === 'photoshop' || props.opening.photoshopRefuses !== undefined;
  return (
    <Show when={shown()}>
      <section class={styles.report} aria-label="Opened like Photoshop" data-reader={props.opening.reader}>
        <Show when={props.opening.photoshopRefuses}>
          {(refusal) => (
            <p class={styles.refusal}>
              <strong>Photoshop does not open this file;</strong> shown as the strict reader reads it. {refusal()}
            </p>
          )}
        </Show>
        <Show when={props.opening.alerts.length}>
          <ul aria-label="Photoshop alerts">
            <For each={props.opening.alerts}>
              {(alert) => (
                <li data-alert={alert.kind}>
                  <strong>Photoshop:</strong> <q>{alert.message}</q> Answered {alert.answer}.
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.opening.repairs.length}>
          <ul aria-label="Repairs">
            <For each={props.opening.repairs}>
              {(repair) => (
                <li>
                  <strong>Repaired:</strong> {repair}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.opening.strictError}>
          {(error) => <p class={styles.strict}>The strict reader cannot read this file: {error()}</p>}
        </Show>
      </section>
    </Show>
  );
}
