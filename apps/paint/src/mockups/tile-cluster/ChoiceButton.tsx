import { For, Show } from 'solid-js';
import { createPickPopup, placeAt } from './createPickPopup';
import styles from './ValueButton.module.css';

/**
 * A choice among a few options as a compact button, its label above the current option, in place of a dropdown or
 * a segmented control: press it, slide onto another option in the list and lift, or tap it and then tap an option.
 * The list opens with the current option under the pointer, so a short slide reaches its neighbours.
 */
export function ChoiceButton(props: {
  label: string;
  value: string;
  options: readonly string[];
  layout?: 'stacked' | 'inline';
  onPick: (option: string) => void;
}) {
  const pick = createPickPopup<string>({
    place(point) {
      const current = Math.max(0, props.options.indexOf(props.value));
      // The current option lies under the pointer.
      return placeAt(point, listWidth, props.options.length * optionHeight + 2 * padding, {
        x: listWidth / 2,
        y: padding + (current + 0.5) * optionHeight
      });
    },
    hit(popup, x, y) {
      const index = Math.floor((y - popup.top - padding) / optionHeight);
      const inside = x >= popup.left - slack && x <= popup.left + popup.width + slack;
      return inside ? props.options[index] : undefined;
    },
    onPreview: () => {},
    onPick: props.onPick
  });

  return (
    <>
      <button
        ref={pick.bindButton}
        class={[styles.button, styles[props.layout ?? 'stacked'], { [styles.active!]: !!pick.popup() }]}
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-expanded={pick.popup() ? 'true' : 'false'}
        title={`${props.label}: press and slide to an option, or tap`}
        {...pick.buttonEvents}
      >
        <span class={styles.label}>{props.label}</span>
        <span class={styles.value}>{props.value}</span>
      </button>
      <Show when={pick.popup()}>
        {(open) => (
          <div
            ref={pick.bindPopup}
            class={[styles.popup, styles.list]}
            role="listbox"
            aria-label={props.label}
            style={{ left: `${open().left}px`, top: `${open().top}px`, width: `${open().width}px` }}
            {...pick.popupEvents}
          >
            <For each={props.options}>
              {(option) => (
                <div
                  class={styles.option}
                  role="option"
                  aria-selected={option === props.value ? 'true' : 'false'}
                  data-current={option === props.value || undefined}
                  data-hover={option === pick.hover() || undefined}
                >
                  {option}
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </>
  );
}

const optionHeight = 32;
const listWidth = 128;
const padding = 4;
/** CSS pixels beside the list where a slide still points at the option level with it. */
const slack = 24;
