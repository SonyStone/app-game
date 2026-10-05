import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './StorageLockNotice.module.css';

/**
 * Covers the canvas while the drawing belongs to Paint in another tab: `busy` when this tab could not open it, `lost`
 * when another tab took it over and this one stopped saving. One drawing is kept by one tab at a time, so that neither
 * saves over the other or removes the other's tiles. "Draw here" takes the drawing for this tab; the other one stops.
 */
export function StorageLockNotice(props: { state: 'busy' | 'lost'; onTakeOver: () => void }) {
  return (
    <div class={styles.cover}>
      <div class={styles.card} role="alertdialog" aria-labelledby="storage-lock-title">
        <strong id="storage-lock-title">
          {props.state === 'busy' ? 'This drawing is open in another tab' : 'This drawing was opened in another tab'}
        </strong>
        <p>
          {props.state === 'busy'
            ? 'Paint keeps a drawing in one tab at a time, so that neither tab saves over the other. Close the other tab, or draw here and the other tab stops.'
            : 'This tab stopped saving, so that it does not save over the other one. Draw here to take the drawing back; the other tab then stops.'}
        </p>
        <button class={styles.primary} onClick={() => props.onTakeOver()}>
          Draw here
        </button>
      </div>
    </div>
  );
}

/**
 * A notice at the top of the canvas that `count` tiles of the drawing could not be read from storage and show as
 * empty, with a button to close it.
 */
export function MissingTilesNotice(props: { count: number; size: ViewSize; onDismiss: () => void }) {
  return (
    <FloatingBar placement={{ left: props.size.width / 2, top: noticeTop }} label="Missing tiles">
      <span role="status">
        {props.count === 1 ? 'A piece' : `${props.count} pieces`} of this drawing could not be read and{' '}
        {props.count === 1 ? 'shows' : 'show'} as empty. This happens when a drawing is open in two tabs.
      </span>
      <button aria-label="Close" onClick={() => props.onDismiss()}>
        <SketchIcon name="close" size={20} />
      </button>
    </FloatingBar>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls and the selection hint. */
const noticeTop = 118;
