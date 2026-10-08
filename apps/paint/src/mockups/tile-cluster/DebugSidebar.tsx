import { For, Show } from 'solid-js';
import type { createDebugOptions, DebugOptions, OptionControl } from './debugOptions';
import { optionParts } from './debugOptions';
import styles from './DebugSidebar.module.css';

/**
 * The mockup's debug panel, always open along the window's right edge: settings that go into Paint, debugging aids,
 * and experiments grouped by the question each answers. Changes apply at once.
 */
export function DebugSidebar(props: {
  debug: ReturnType<typeof createDebugOptions>;
  /** A line about live input, such as the pen's last event. */
  status: string;
  /** Clears the drawing and its history. */
  onClear: () => void;
  /** Opens the ring editor. */
  onEditRing: () => void;
}) {
  return (
    <aside class={styles.sidebar} data-cluster-ui>
      <For each={optionParts}>
        {(part) => (
          <section class={styles.part}>
            <h3>{part.title}</h3>
            <Show when={part.title === 'Debug'}>
              <p class={styles.status}>{props.status}</p>
            </Show>
            <For each={part.groups}>
              {(group) => (
                <div class={styles.group}>
                  <Show when={group.question}>{(question) => <h4>{question()}</h4>}</Show>
                  <For each={group.options}>{(control) => <OptionRow control={control} debug={props.debug} />}</For>
                </div>
              )}
            </For>
            <Show when={part.title === 'Debug'}>
              <div class={styles.actions}>
                <button onClick={props.onClear}>Clear drawing</button>
                <button onClick={props.debug.reset}>Reset options</button>
              </div>
            </Show>
            <Show when={part.title === 'Experiments'}>
              <div class={styles.actions}>
                <button onClick={props.onEditRing}>Edit the ring…</button>
              </div>
            </Show>
          </section>
        )}
      </For>
    </aside>
  );
}

/** One option: segmented buttons for a choice, a range with its value for a number, or a checkbox. */
function OptionRow(props: { control: OptionControl; debug: ReturnType<typeof createDebugOptions> }) {
  const value = () => props.debug.options()[props.control.key];
  const set = (next: DebugOptions[keyof DebugOptions]) => props.debug.set(props.control.key, next as never);

  return (
    <div class={styles.row}>
      {(() => {
        const control = props.control;
        if ('choices' in control) {
          return (
            <>
              <span>{control.label}</span>
              <span class={styles.choices}>
                <For each={control.choices}>
                  {(choice) => (
                    <button
                      class={{ [styles.on!]: value() === choice }}
                      aria-pressed={value() === choice ? 'true' : 'false'}
                      onClick={() => set(choice as never)}
                    >
                      {choice}
                    </button>
                  )}
                </For>
              </span>
            </>
          );
        }

        if ('min' in control) {
          return (
            <>
              <span>
                {control.label} <b>{value() as number}</b>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value() as number}
                onInput={(event) => set(Number(event.currentTarget.value) as never)}
              />
            </>
          );
        }

        return (
          <label class={styles.toggle}>
            <input
              type="checkbox"
              checked={!!value()}
              onChange={(event) => set(event.currentTarget.checked as never)}
            />
            {control.label}
          </label>
        );
      })()}
    </div>
  );
}
