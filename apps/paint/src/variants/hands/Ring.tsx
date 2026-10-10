import { For, Show } from 'solid-js';
import { penModeInfo, type PenMode } from './createPenModes';
import type { RingLayout } from './geometry';
import { ModeIcon } from './ModeIcon';
import styles from './Ring.module.css';

/**
 * The ring of pen modes fanned around a finger or the pointer, in client pixels. The mode pointed at is lit and named
 * beside its button; the latched mode has a ring. While a finger holds the ring (`interactive` false) its buttons let
 * every press through, so the pen can draw beside them; an open ring's buttons take clicks and taps.
 */
export function Ring(props: {
  layout: RingLayout<PenMode>;
  hovered: PenMode | undefined;
  latched: PenMode;
  interactive: boolean;
  onChoose: (mode: PenMode) => void;
  /** The pointer moved onto a mode, or off all of them. */
  onHover?: (mode: PenMode | undefined) => void;
}) {
  const named = () => props.layout.items.find((item) => item.id === props.hovered);

  return (
    <div
      class={styles.ring}
      data-hands-ui
      data-interactive={props.interactive ? '' : undefined}
      role="menu"
      aria-label="Pen modes"
    >
      <span class={styles.origin} style={{ left: `${props.layout.origin.x}px`, top: `${props.layout.origin.y}px` }} />
      <For each={props.layout.items} keyed={false}>
        {(item) => (
          <button
            class={styles.item}
            role="menuitemradio"
            aria-checked={props.latched === item().id ? 'true' : 'false'}
            aria-label={penModeInfo[item().id].label}
            aria-keyshortcuts={penModeInfo[item().id].key}
            data-hovered={props.hovered === item().id ? '' : undefined}
            style={{ left: `${item().x}px`, top: `${item().y}px` }}
            onClick={() => props.onChoose(item().id)}
            onPointerEnter={(event) => event.pointerType !== 'touch' && props.onHover?.(item().id)}
            onPointerLeave={(event) => event.pointerType !== 'touch' && props.onHover?.(undefined)}
          >
            <ModeIcon mode={item().id} size={22} />
          </button>
        )}
      </For>
      <Show when={named()}>
        {(item) => {
          const direction = () => {
            const dx = item().x - props.layout.center.x;
            const dy = item().y - props.layout.center.y;
            const length = Math.hypot(dx, dy) || 1;
            return { x: dx / length, y: dy / length };
          };
          return (
            <span
              class={styles.label}
              data-side={direction().x < -0.3 ? 'left' : direction().x > 0.3 ? 'right' : 'middle'}
              style={{
                left: `${item().x + direction().x * labelDistance}px`,
                top: `${item().y + direction().y * labelDistance}px`
              }}
            >
              {penModeInfo[item().id].label}
            </span>
          );
        }}
      </Show>
    </div>
  );
}

/** Distance in CSS pixels from a mode's button center to its name. */
const labelDistance = 36;
