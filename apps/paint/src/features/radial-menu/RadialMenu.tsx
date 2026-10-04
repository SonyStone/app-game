import type { Point } from '@app-game/paint-core/camera';
import { For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { radialLayout, type RadialItem } from './createRadialMenu';
import styles from './RadialMenu.module.css';

/**
 * The ring of actions around the open navigation puck; render it as the puck's child, so that it sits above the layer
 * that dismisses the puck. The action a barrel-button drag points at is highlighted and named below the ring. Hidden
 * while the puck navigates.
 */
export function RadialMenu(props: {
  /** Center of the puck in client CSS pixels. */
  center: Point;
  items: readonly RadialItem[];
  /** Id of the action a drag points at. */
  highlighted: string | undefined;
  hidden: boolean;
  onChoose: (id: string) => void;
}) {
  const caption = () => props.items.find((item) => item.id === props.highlighted)?.label;

  return (
    <div
      class={styles.ring}
      role="menu"
      aria-label="Quick actions"
      data-hidden={props.hidden ? 'true' : 'false'}
      style={{ left: `${props.center.x}px`, top: `${props.center.y}px` }}
    >
      <For each={props.items}>
        {(item) => {
          const angle = () => (item.slot / radialLayout.slots) * Math.PI * 2;
          return (
            <button
              class={styles.item}
              role="menuitem"
              aria-label={item.label}
              title={item.label}
              aria-current={item.active ? 'true' : undefined}
              disabled={item.disabled}
              data-highlighted={item.id === props.highlighted ? 'true' : 'false'}
              style={{
                left: `${Math.sin(angle()) * radialLayout.radius}px`,
                top: `${-Math.cos(angle()) * radialLayout.radius}px`,
                width: `${radialLayout.item}px`,
                height: `${radialLayout.item}px`
              }}
              onClick={() => props.onChoose(item.id)}
            >
              <Show when={item.icon} fallback={<span class={styles.text}>{item.text}</span>}>
                {(icon) => <SketchIcon name={icon()} size={22} />}
              </Show>
            </button>
          );
        }}
      </For>
      <Show when={caption()}>
        {(label) => (
          <span class={styles.caption} style={{ top: `${radialLayout.reach + 6}px` }} aria-live="polite">
            {label()}
          </span>
        )}
      </Show>
    </div>
  );
}
