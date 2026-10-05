import { cn } from '@app-game/utils/cn';
import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

/*
 * Settings controls shared by the demos. They tint themselves with the inherited
 * text colour, so they work inside light and dark docks and on the page.
 */

/** Padded column of settings with an optional hint. */
export function SettingList(props: { hint?: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="flex flex-col gap-1 p-2">
      <Show when={props.hint}>
        <p class="px-2.5 pb-1 text-[11px] opacity-60">{props.hint}</p>
      </Show>
      {props.children}
    </div>
  );
}

/** Selectable row of a single-choice list, tinted by the inherited text colour. */
export function Choice(props: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={props.selected ? 'true' : 'false'}
      class={cn(
        'flex flex-col rounded-[8px] border px-2.5 py-1.5 text-left transition-colors',
        props.selected
          ? 'border-sky-500 !bg-sky-500/12'
          : 'border-transparent hover:!bg-[color-mix(in_srgb,currentColor_7%,transparent)]'
      )}
      onClick={() => props.onSelect()}
    >
      <span class="text-[13px] font-medium">{props.label}</span>
      <span class="text-[11px] opacity-60">{props.description}</span>
    </button>
  );
}

/** Labelled checkbox. */
export function Toggle(props: { label: string; checked: boolean; onChange: (value: boolean) => void }): JSX.Element {
  return (
    <label class="flex cursor-pointer items-center justify-between gap-3 rounded-[8px] px-2.5 py-1.5 text-[13px] hover:bg-[color-mix(in_srgb,currentColor_7%,transparent)]">
      {props.label}
      <input
        type="checkbox"
        class="h-4 w-4 accent-sky-500"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

/** Labelled range input showing its value and unit. */
export function Slider(props: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label class="flex flex-col gap-1 rounded-[8px] px-2.5 py-1.5 text-[13px]">
      <span class="flex justify-between">
        {props.label}
        <span class="tabular-nums opacity-60">
          {props.value} {props.unit}
        </span>
      </span>
      <input
        type="range"
        class="accent-sky-500"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
