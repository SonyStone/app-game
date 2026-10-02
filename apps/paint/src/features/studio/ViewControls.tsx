import { Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { createFullscreenToggle } from './createFullscreenToggle';
import styles from './PaintStudio.module.css';

/** Top-center view strip: fullscreen, zoom steps and the zoom level, and a rotation reset while the view is rotated. */
export function ViewControls(props: {
  fullscreen: ReturnType<typeof createFullscreenToggle>;
  /** Camera zoom, where 1 is 100%. */
  zoom: number;
  /** Camera rotation in radians; the reset button appears only when it is visibly rotated. */
  angle: number;
  /** Zooms around the viewport center by `factor`. */
  onZoomBy: (factor: number) => void;
  onResetZoom: () => void;
  onResetRotation: () => void;
}) {
  return (
    <div class={styles.viewControls} aria-label="Canvas view">
      <button {...props.fullscreen.props}>
        <SketchIcon name={props.fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'} size={16} />
      </button>
      <button aria-label="Zoom out" onClick={() => props.onZoomBy(0.8)}>
        <SketchIcon name="minus" size={16} />
      </button>
      <button aria-label="Reset zoom" title="Reset zoom to 100%" onClick={() => props.onResetZoom()}>
        {Math.round(props.zoom * 100)}%
      </button>
      <button aria-label="Zoom in" onClick={() => props.onZoomBy(1.25)}>
        <SketchIcon name="plus" size={16} />
      </button>
      <Show when={Math.abs(props.angle) > 0.005}>
        <button aria-label="Reset rotation" title="Reset rotation" onClick={() => props.onResetRotation()}>
          {Math.round((props.angle * 180) / Math.PI)}°
        </button>
      </Show>
    </div>
  );
}
