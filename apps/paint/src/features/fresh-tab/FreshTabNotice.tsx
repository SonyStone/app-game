import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './FreshTab.module.css';

/**
 * A small pill at the top of the canvas once Chrome stops seeing the pen above the screen: a picture of the pen over
 * the screen, crossed out, and one button that fixes it by continuing in a new tab, with a close button. Testers did
 * not read a sentence, so the words are two; the full story is the button's tooltip. `blocked` says Chrome refused
 * to open the tab by itself, so a tap is needed. It lies on the free hand's side, a quarter of the view in from that
 * edge, away from the hand holding the pen. Moving by itself from now on is a pen setting, not offered here. See
 * `createFreshTab`.
 */
export function FreshTabNotice(props: {
  size: ViewSize;
  /** The hand holding the pen, as palm rejection knows it; the notice goes to the other side. */
  hand: 'left' | 'right';
  blocked: boolean;
  onMove: () => void;
  onDismiss: () => void;
}) {
  const left = () => props.size.width * (props.hand === 'left' ? 0.75 : 0.25);

  return (
    <FloatingBar placement={{ left: left(), top: noticeTop }} label="Pen hover lost">
      <PenHoverLostIcon />
      <button
        class={`${floatingBarPrimary} ${styles.text}`}
        title={
          props.blocked
            ? 'Chrome did not open the new tab by itself: tap to continue in a new tab.'
            : 'Chrome stopped seeing the pen above the screen, so the palm is not ignored. A new tab sees it again; the drawing and its undo go along.'
        }
        onClick={() => props.onMove()}
      >
        Fix pen
      </button>
      <button aria-label="Close" onClick={() => props.onDismiss()}>
        <SketchIcon name="close" size={20} />
      </button>
    </FloatingBar>
  );
}

/** The pen held above the screen with the hover between them, crossed out. */
function PenHoverLostIcon() {
  return (
    <svg class={styles.icon} viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <path d="M4 28h24" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="m21 4 5 5-10 10-6 2 2-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <path
        d="M9 24c1.5-1 3.5-1 5 0M7 26.5c2.5-1.5 6.5-1.5 9 0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-dasharray="1.5 2"
      />
      <path d="M5 5 27 27" stroke="#d9473b" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls. */
const noticeTop = 66;
