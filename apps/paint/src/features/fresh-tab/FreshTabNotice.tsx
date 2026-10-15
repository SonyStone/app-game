import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './FreshTab.module.css';

/**
 * A notice at the top of the canvas that Chrome stopped seeing the pen above the screen, with a button to continue in
 * a new tab, a checkbox to do that automatically from now on, and a button to close the notice. `blocked` says that
 * Chrome refused to open the tab by itself. See `createFreshTab`.
 */
export function FreshTabNotice(props: {
  size: ViewSize;
  blocked: boolean;
  auto: boolean;
  onMove: () => void;
  onAutoChange: (auto: boolean) => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingBar placement={{ left: props.size.width / 2, top: noticeTop }} label="Pen hover">
      <span role="status">
        {props.blocked
          ? 'Chrome did not open the new tab by itself.'
          : 'Chrome stopped seeing the pen above the screen.'}
      </span>
      <button class={`${floatingBarPrimary} ${styles.text}`} onClick={() => props.onMove()}>
        Continue in a new tab
      </button>
      <label class={styles.auto}>
        <input
          type="checkbox"
          checked={props.auto}
          onChange={(event) => props.onAutoChange(event.currentTarget.checked)}
        />
        Always
      </label>
      <button aria-label="Close" onClick={() => props.onDismiss()}>
        <SketchIcon name="close" size={20} />
      </button>
    </FloatingBar>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls. */
const noticeTop = 66;
