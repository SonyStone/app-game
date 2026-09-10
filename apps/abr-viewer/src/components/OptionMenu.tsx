import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, createUniqueId, For, onSettled, Show } from 'solid-js';
import checkIcon from '../assets/icons/tool-options/check.svg?url';
import chevronIcon from '../assets/icons/tool-options/chevron-down.svg?url';
import styles from './OptionMenu.module.css';

/** Controlled choice list with icons and separators. Native popovers escape clipping in the embedded editor. */
export function OptionMenu(props: {
  label: string;
  value: string | number;
  options: readonly OptionMenuItem[];
  onChange: (value: string | number) => void;
}) {
  const id = createUniqueId();
  const [supported, setSupported] = createSignal(false);
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  let trigger!: HTMLButtonElement;
  let popup!: HTMLDivElement;
  let search = '',
    searchTime = 0;
  const selected = () => props.options.find((option) => option.value === props.value);
  const entries = () =>
    selected() ? props.options : [{ value: props.value, label: `Imported (${props.value})` }, ...props.options];
  const buttons = () => Array.from(popup.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  const close = (restoreFocus = false) => {
    popup?.hidePopover();
    if (restoreFocus) trigger.focus();
  };
  function show() {
    popup.showPopover();
    const rect = trigger.getBoundingClientRect();
    const height = window.innerHeight - 16;
    popup.style.maxHeight = `${height}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 3, window.innerHeight - popup.offsetHeight - 8))}px`;
    const button =
      buttons()[
        Math.max(
          0,
          entries().findIndex((option) => option.value === props.value)
        )
      ];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest' });
  }
  onSettled(() => {
    setSupported('showPopover' in HTMLElement.prototype);
  });
  if (typeof window !== 'undefined') {
    makeEventListener(window, 'resize', () => close());
    makeEventListener(
      window,
      'scroll',
      (event) => {
        if (event.target instanceof Node && !popup?.contains(event.target)) close();
      },
      { capture: true }
    );
  }
  return (
    <Show
      when={supported()}
      fallback={
        <select
          aria-label={props.label}
          value={String(props.value)}
          onChange={(event) => {
            const option = entries().find((entry) => String(entry.value) === event.currentTarget.value);
            if (option) props.onChange(option.value);
          }}
        >
          <For each={entries()}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
      }
    >
      <button
        ref={trigger}
        type="button"
        class={styles.optionTrigger}
        role="combobox"
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-controls={id}
        aria-expanded={open() ? 'true' : 'false'}
        onClick={() => (popup.matches(':popover-open') ? close() : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            show();
            if (event.key === 'Home') buttons()[0]?.focus();
            if (event.key === 'End') buttons().at(-1)?.focus();
          }
        }}
      >
        <Show when={selected()?.icon}>{(icon) => <img src={icon()} alt="" />}</Show>
        <span>{selected()?.label ?? `Imported (${props.value})`}</span>
        <img class={styles.optionChevron} src={chevronIcon} alt="" />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        role="listbox"
        aria-label={props.label}
        class={styles.optionMenu}
        onToggle={() => setOpen(popup.matches(':popover-open'))}
        onKeyDown={(event) => {
          event.stopPropagation();
          const items = buttons(),
            current = items.findIndex((item) => item === document.activeElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
          } else if (event.key === 'Tab') close(true);
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          } else if (event.key.length === 1 && event.key !== ' ' && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            const now = performance.now();
            search = (now - searchTime < 700 ? search : '') + event.key.toLowerCase();
            searchTime = now;
            const candidates = entries();
            for (let step = 1; step <= candidates.length; step++) {
              const index = (current + step) % candidates.length;
              if (candidates[index]?.label.toLowerCase().startsWith(search)) {
                items[index]?.focus();
                break;
              }
            }
          }
        }}
      >
        <For each={entries()}>
          {(option) => (
            <>
              <Show when={option.separatorBefore}>
                <hr role="separator" />
              </Show>
              <button
                type="button"
                role="option"
                tabindex="-1"
                aria-selected={option.value === props.value ? 'true' : 'false'}
                onClick={() => {
                  props.onChange(option.value);
                  close(true);
                }}
              >
                <img
                  class={styles.optionCheck}
                  src={checkIcon}
                  alt=""
                  style={{ visibility: option.value === props.value ? 'visible' : 'hidden' }}
                />
                <Show when={option.icon}>{(icon) => <img src={icon()} alt="" />}</Show>
                <span>{option.label}</span>
              </button>
            </>
          )}
        </For>
      </div>
    </Show>
  );
}

/** Stable native value plus display-only decoration; decoration never enters the saved preset. */
export type OptionMenuItem = {
  value: string | number;
  label: string;
  icon?: string;
  separatorBefore?: boolean;
};
