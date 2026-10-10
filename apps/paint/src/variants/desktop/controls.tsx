import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './controls.module.css';

// Small controls shared by the Desktop variant's bars and panels, in its dense grey look: icon buttons, text toggles,
// segmented choices, drop-down choices and labelled scrub fields.

/** A square button showing `icon`; `pressed` makes it a toggle. `title` defaults to `label`. */
export function IconButton(props: {
  icon: SketchIconName;
  label: string;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Icon size in CSS pixels; 16 by default. */
  size?: number;
  onClick: () => void;
}) {
  return (
    <button
      class={styles.iconButton}
      aria-label={props.label}
      title={props.title ?? props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={props.size ?? 16} />
    </button>
  );
}

/** A text button that stays pressed while `on`. */
export function Toggle(props: {
  label: string;
  title?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      class={styles.toggle}
      aria-pressed={props.on ? 'true' : 'false'}
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={() => props.onToggle()}
    >
      {props.label}
    </button>
  );
}

/** A text button for a command. */
export function TextButton(props: { label: string; title?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      class={styles.textButton}
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.label}
    </button>
  );
}

/** One of a few choices as a row of joined buttons, each an icon or a short text. */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: SketchIconName; text?: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div class={styles.segmented} role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <button
            role="radio"
            aria-checked={props.value === option.value ? 'true' : 'false'}
            aria-label={option.label}
            title={option.label}
            disabled={props.disabled}
            onClick={() => props.onChange(option.value)}
          >
            {option.icon ? <SketchIcon name={option.icon} size={16} /> : (option.text ?? option.label)}
          </button>
        )}
      </For>
    </div>
  );
}

/** A drop-down choice; the open list is the browser's own. */
export function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <select
      class={styles.choice}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value as T)}
    >
      <For each={props.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
    </select>
  );
}

/** A label before a scrub field, as Photoshop's options bar shows its numbers. See `ScrubNumber` for the props. */
export function ScrubField(props: Parameters<typeof ScrubNumber>[0] & { caption: string; width?: number }) {
  return (
    <span class={styles.field} style={{ '--scrub-width': `${props.width ?? 64}px` }}>
      <span class={styles.caption} aria-hidden="true">
        {props.caption}
      </span>
      <ScrubNumber {...props} />
    </span>
  );
}

/** A thin vertical line between groups of a bar. */
export function Divider() {
  return <span class={styles.divider} aria-hidden="true" />;
}

/** A group of related controls with a caption, as `role="group"`. */
export function Group(props: { label: string; caption?: string; children: JSX.Element }) {
  return (
    <div class={styles.group} role="group" aria-label={props.label}>
      {props.caption && <span class={styles.caption}>{props.caption}</span>}
      {props.children}
    </div>
  );
}

/** Two arrows that exchange the foreground and background colors. */
export function SwapIcon(props: { size?: number }) {
  return (
    <svg
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4.5V3a1 1 0 0 1 1-1h6.5M8 0.5 9.5 2 8 3.5M10 7.5V9a1 1 0 0 1-1 1H2.5M4 8.5 2.5 10 4 11.5" />
    </svg>
  );
}
