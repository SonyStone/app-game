import type { Camera, ViewSize } from '@app-game/paint-core/camera';
import { Show } from 'solid-js';
import styles from './PixelGrid.module.css';
import { pixelGridZoom } from './createViewOptions';

/**
 * Lines between document pixels over the canvas, as Photoshop's pixel grid, from {@link pixelGridZoom} on. The grid is
 * a patch of document pixels around the view, turned, mirrored and scaled like the camera, so the lines stay on pixel
 * edges; it ignores pointers.
 */
export function PixelGrid(props: { camera: Camera; size: ViewSize }) {
  /** Document pixels per side of the patch: the view's diagonal, plus a pixel at each end. */
  const side = () => Math.ceil(Math.hypot(props.size.width, props.size.height) / props.camera.zoom) + 2;
  /** The patch's top-left corner, on a pixel edge. */
  const corner = () => ({
    x: Math.floor(props.camera.x - side() / 2),
    y: Math.floor(props.camera.y - side() / 2)
  });

  return (
    <Show when={props.camera.zoom >= pixelGridZoom}>
      <div
        class={styles.grid}
        aria-hidden="true"
        style={{
          width: `${side()}px`,
          height: `${side()}px`,
          '--line': `${1 / props.camera.zoom}px`,
          transform: [
            `translate(${props.size.width / 2}px, ${props.size.height / 2}px)`,
            `rotate(${props.camera.angle}rad)`,
            `scale(${props.camera.zoom * (props.camera.mirrored ? -1 : 1)}, ${props.camera.zoom})`,
            `translate(${corner().x - props.camera.x}px, ${corner().y - props.camera.y}px)`
          ].join(' ')
        }}
      />
    </Show>
  );
}
