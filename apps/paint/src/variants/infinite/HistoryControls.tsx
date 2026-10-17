import { createSignal, Show } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './HistoryControls.module.css';
import { InfiniteIcon } from './icons';
import theme from './theme.module.css';

/**
 * Infinite Painter's undo system (manual pp. 46–47): Undo at the bottom-left corner, Redo beside it once there is
 * something to redo, and after the first undo a History button above them that opens the undo history slider across
 * the bottom. Dragging its thumb left undoes and right redoes, a step per notch: `onStep` receives how many steps to
 * go, negative for undo, as the thumb passes notches. Infinite Painter clears the layer on a long press of Undo; Paint
 * leaves that out, as the clear is a menu command anyway and a long press is too easy to make by accident.
 */
export function HistoryControls(props: {
  canUndo: boolean;
  canRedo: boolean;
  /** How many history states there are, the opened drawing included, and which one is shown. */
  states: number;
  current: number;
  disabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onStep: (steps: number) => void;
}) {
  const [used, setUsed] = createSignal(false);
  const [sliding, setSliding] = createSignal(false);

  return (
    <div class={[theme.theme, styles.corner]}>
      <Show when={sliding()}>
        <HistorySlider {...props} onClose={() => setSliding(false)} />
      </Show>
      <Show when={!sliding() && used() && props.states > 1}>
        <button
          class={[theme.iconButton, styles.icon]}
          aria-label="Undo history"
          title="Undo history · drag through the steps"
          onClick={() => setSliding(true)}
        >
          <InfiniteIcon name="history" size={20} />
        </button>
      </Show>
      <div class={styles.buttons}>
        <button
          class={[theme.iconButton, styles.icon]}
          aria-label="Undo"
          aria-keyshortcuts="Control+Z Meta+Z"
          title="Undo · two-finger tap"
          disabled={!props.canUndo || props.disabled}
          onClick={() => {
            setUsed(true);
            props.onUndo();
          }}
        >
          <InfiniteIcon name="undo" size={22} />
        </button>
        <Show when={props.canRedo}>
          <button
            class={[theme.iconButton, styles.icon]}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            title="Redo · three-finger tap"
            disabled={props.disabled}
            onClick={() => props.onRedo()}
          >
            <InfiniteIcon name="redo" size={22} />
          </button>
        </Show>
      </div>
    </div>
  );
}

/**
 * The undo history slider: a long track with a notch per history state. The thumb follows the drag notch by notch;
 * each notch passed is a step for `onStep`, counted from the notch the thumb last stood at, so steps arriving before
 * the engine reports the new state are not repeated.
 */
function HistorySlider(props: {
  states: number;
  current: number;
  disabled?: boolean;
  onStep: (steps: number) => void;
  onClose: () => void;
}) {
  /** The notch the drag has asked for, while it lasts. */
  const [asked, setAsked] = createSignal<number>();
  const shown = () => asked() ?? props.current;
  const fraction = () => (props.states > 1 ? shown() / (props.states - 1) : 1);

  const notchAt = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const place = Math.min(1, Math.max(0, (press.point.x - rect.left - trackInset) / (rect.width - trackInset * 2)));
    return Math.round(place * (props.states - 1));
  };
  const goTo = (notch: number) => {
    const from = shown();
    if (notch !== from) {
      setAsked(notch);
      props.onStep(notch - from);
    }
  };
  const press = pressHandlers({
    start: () => !props.disabled,
    move: (moved) => goTo(notchAt(moved)),
    tap: (tapped) => goTo(notchAt(tapped)),
    end: (ended) => {
      goTo(notchAt(ended));
      setAsked(undefined);
    },
    cancel: () => setAsked(undefined),
    tapDistance: 0
  });

  return (
    <div class={styles.sliderRow}>
      <button
        class={[theme.iconButton, styles.icon]}
        aria-label="Close the undo history"
        onClick={() => props.onClose()}
      >
        <InfiniteIcon name="close" size={20} />
      </button>
      <div
        class={styles.track}
        role="slider"
        aria-label="Undo history"
        aria-valuemin={0}
        aria-valuemax={props.states - 1}
        aria-valuenow={shown()}
        style={{ '--fraction': fraction() }}
        {...press}
      >
        <span class={styles.line} />
        <span class={styles.thumb} />
      </div>
    </div>
  );
}

/** How far, in CSS pixels, the track's first and last notches sit from its ends; the stylesheet matches it. */
const trackInset = 18;
