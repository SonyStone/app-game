import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import theme from './theme.module.css';
import styles from './ToolMiniBars.module.css';

/**
 * Infinite Painter's tool mini-toolbars (manual: interface controls): while a tool without a toolbar of its own is on,
 * such as a guide, symmetry or a fill, a small bar in the upper right shows its icon, and several stack. A tap on the
 * icon closes the tool; `controls` hold what else the bar offers, such as Apply and Cancel of a transform.
 */
export function ToolMiniBars(props: { bars: readonly MiniBar[] }) {
  return (
    <div class={styles.stack}>
      <For each={props.bars}>
        {(bar) => (
          <div class={[theme.panel, styles.bar]} role="toolbar" aria-label={bar.label}>
            <button
              class={[theme.iconButton, styles.close]}
              aria-label={`Close ${bar.label}`}
              title={`${bar.label} · tap to close`}
              onClick={() => bar.onClose()}
            >
              <InfiniteIcon name={bar.icon} size={20} />
            </button>
            <Show when={bar.controls}>{bar.controls}</Show>
          </div>
        )}
      </For>
    </div>
  );
}

/** One mini-toolbar: the tool's icon and name, closing it, and its other controls. */
export type MiniBar = {
  id: string;
  label: string;
  icon: InfiniteIconName;
  onClose: () => void;
  controls?: JSX.Element;
};

/** A text button of a mini-toolbar, such as a transform's Apply; `pressed` marks a mode that is on. */
export function MiniBarButton(props: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      class={styles.text}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.label}
    </button>
  );
}
