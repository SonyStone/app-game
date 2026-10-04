import type { JSX } from '@solidjs/web';
import styles from './HintCard.module.css';

/**
 * A visual tooltip: a control's name and shortcut, what it does in one line, and, when the hint has one, a small
 * looping demonstration, so a control can be understood before it is tried. `style` places it; it ignores pointers.
 * Animations stop for reduced motion.
 */
export function HintCard(props: { hint: Hint; style: JSX.CSSProperties }) {
  return (
    <div class={styles.hint} role="tooltip" style={props.style}>
      {props.hint.demo && (
        <svg class={styles.demo} viewBox="0 0 120 72" aria-hidden="true">
          {props.hint.demo()}
        </svg>
      )}
      <div class={styles.text}>
        <strong>
          {props.hint.title}
          {props.hint.shortcut && <kbd>{props.hint.shortcut}</kbd>}
        </strong>
        <span>{props.hint.description}</span>
      </div>
    </div>
  );
}

/** What a hint shows; `demo` draws into a 120 × 72 view box with the classes of {@link hintDemo}. */
export type Hint = { title: string; shortcut?: string; description: string; demo?: () => JSX.Element };

/**
 * Classes for drawing demonstrations: `draw` draws a stroke on, `ink` is a thick stroke, `erase` erases across it,
 * `outline` a thin line, `fillArea` fades a fill in, `click` pulses a press, `drag` draws a drag line on, `dashed`
 * marches like a selection, `turn`, `flip`, `flipY` and `lift` animate a group, `axis` is a guide line, `shape` a filled
 * shape and `morph` a path that changes from its `d` to the `--to` path.
 */
export const hintDemo = {
  draw: styles.draw!,
  ink: styles.ink!,
  erase: styles.erase!,
  outline: styles.outline!,
  fillArea: styles.fillArea!,
  click: styles.click!,
  drag: styles.drag!,
  dashed: styles.dashed!,
  turn: styles.turn!,
  flip: styles.flip!,
  flipY: styles.flipY!,
  lift: styles.lift!,
  axis: styles.axis!,
  shape: styles.shape!,
  morph: styles.morph!
};
