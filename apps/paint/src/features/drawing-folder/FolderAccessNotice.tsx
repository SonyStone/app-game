import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './DrawingFolder.module.css';

/**
 * A notice at the top of the canvas while the browser waits for the user to allow the drawing's folder again, as it
 * may after a restart; until then the parts of the drawing kept only there do not show.
 */
export function FolderAccessNotice(props: { name: string; size: ViewSize; onAllow: () => void }) {
  return (
    <FloatingBar placement={{ left: props.size.width / 2, top: noticeTop }} label="Drawing folder">
      <span>
        <SketchIcon name="hidden" size={18} />
      </span>
      <span role="status">The drawing is kept in “{props.name}”.</span>
      <button class={`${floatingBarPrimary} ${styles.text}`} onClick={() => props.onAllow()}>
        Allow access
      </button>
    </FloatingBar>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls. */
const noticeTop = 66;
