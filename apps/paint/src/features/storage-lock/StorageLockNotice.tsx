import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './StorageLockNotice.module.css';

/**
 * Covers the canvas while the drawing belongs to Paint in another tab: `busy` when this tab could not open it, `lost`
 * when another tab took it over and this one stopped saving, `moved` when this tab handed it to a new one, where the
 * pen hovers again. One drawing is kept by one tab at a time, so that neither saves over the other or removes the
 * other's tiles. "Draw here" takes the drawing for this tab; the other one stops.
 */
export function StorageLockNotice(props: { state: 'busy' | 'lost' | 'moved'; onTakeOver: () => void }) {
  return (
    <div class={styles.cover}>
      <div class={styles.card} role="alertdialog" aria-labelledby="storage-lock-title">
        <strong id="storage-lock-title">{texts[props.state].title}</strong>
        <p>{texts[props.state].text}</p>
        <button class={styles.primary} onClick={() => props.onTakeOver()}>
          Draw here
        </button>
      </div>
    </div>
  );
}

/** What the notice says in each state. */
const texts = {
  busy: {
    title: 'This drawing is open in another tab',
    text: 'Paint keeps a drawing in one tab at a time, so that neither tab saves over the other. Close the other tab, or draw here and the other tab stops.'
  },
  lost: {
    title: 'This drawing was opened in another tab',
    text: 'This tab stopped saving, so that it does not save over the other one. Draw here to take the drawing back; the other tab then stops.'
  },
  moved: {
    title: 'This drawing moved to a new tab',
    text: 'Chrome stopped seeing the pen above the screen in this tab, so Paint continues in a new one, with the undo history. This tab no longer saves; you can close it. Draw here to take the drawing back.'
  }
};

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
