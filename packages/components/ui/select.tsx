import { createEffect, createSignal, createUniqueId, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import styles from './controls.module.css';

/** Solid UI select adapted to the shared Solid 2 Popover; supports arrows, typeahead and Escape. */
export function Select(props: {
  options: readonly { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  disabled?: boolean;
  placeholder?: string;
  class?: JSX.ClassValue;
}) {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const id = createUniqueId();
  let search = '', searchedAt = 0;
  let trigger: HTMLButtonElement | undefined;
  const optionId = (index: number) => `${id}-option-${index}`;
  const selected = () => props.options.find(option => option.value === props.value);
  createEffect(() => open() ? active() : -1, index => {
    if (index >= 0) document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
  });

  return <Popover open={open()} onOpenChange={value => { setOpen(value); if (value) setActive(Math.max(0, props.options.findIndex(option => option.value === props.value))); }}>
    <PopoverTrigger ref={element => { trigger = element; }} type="button" role="combobox" aria-haspopup="listbox" aria-label={props['aria-label']} aria-activedescendant={open() ? optionId(active()) : undefined} disabled={props.disabled} class={[styles.selectTrigger, props.class]} onKeyDown={onKeyDown}>
      <span>{selected()?.label ?? props.placeholder ?? 'Select'}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 9 4-4 4 4m-8 6 4 4 4-4" /></svg>
    </PopoverTrigger>
    <PopoverContent role="listbox" aria-label={props['aria-label']} class={styles.selectContent}>
      <For each={props.options}>{(option, index) => <div id={optionId(index())} role="option" aria-selected={option.value === props.value ? 'true' : 'false'} aria-disabled={option.disabled ? 'true' : 'false'} data-active={index() === active() ? 'true' : 'false'} class={styles.option} onPointerMove={() => { if (!option.disabled) setActive(index()); }} onPointerDown={event => event.preventDefault()} onClick={() => choose(index())}>
        <span>{option.label}</span><Show when={option.value === props.value}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5 10-10" /></svg></Show>
      </div>}</For>
    </PopoverContent>
  </Popover>;

  function choose(index: number) {
    const option = props.options[index];
    if (!option || option.disabled) return;
    props.onChange(option.value);
    setOpen(false);
    trigger?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab' || event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open()) choose(active());
      else { setActive(Math.max(0, props.options.findIndex(option => option.value === props.value))); setOpen(true); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const enabled = props.options.map((option, index) => !option.disabled ? index : -1).filter(index => index >= 0);
      if (!enabled.length) return;
      const current = enabled.indexOf(open() ? active() : props.options.findIndex(option => option.value === props.value));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : Math.max(0, Math.min(enabled.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(enabled[next]!); setOpen(true);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search = (performance.now() - searchedAt < 700 ? search : '') + event.key.toLowerCase();
      searchedAt = performance.now();
      const index = props.options.findIndex(option => !option.disabled && option.label.toLowerCase().startsWith(search));
      if (index >= 0) { setActive(index); setOpen(true); }
    }
  }
}
