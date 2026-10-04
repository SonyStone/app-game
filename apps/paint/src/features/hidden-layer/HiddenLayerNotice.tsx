import type { ViewSize } from '@app-game/paint-core/camera';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './HiddenLayerNotice.module.css';

/** A notice at the top of the canvas that the active layer is hidden, with buttons to show it or close the notice. */
export function HiddenLayerNotice(props: {
  /** The hidden layer's name. */
  name: string;
  size: ViewSize;
  onShow: () => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingBar placement={{ left: props.size.width / 2, top: noticeTop }} label="Hidden layer">
      <span>
        <SketchIcon name="hidden" size={18} />
      </span>
      <span role="status">“{props.name}” is hidden, so it cannot be painted on.</span>
      <button class={`${floatingBarPrimary} ${styles.text}`} onClick={() => props.onShow()}>
        Show layer
      </button>
      <button aria-label="Close" onClick={() => props.onDismiss()}>
        <SketchIcon name="close" size={20} />
      </button>
    </FloatingBar>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls. */
const noticeTop = 66;
