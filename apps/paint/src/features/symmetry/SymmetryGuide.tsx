import { worldToScreen, type Camera, type ViewSize } from '@app-game/paint-core/camera';
import { symmetryGuide, type PaintSymmetry } from '@app-game/paint-core/symmetry';
import { Show } from 'solid-js';
import styles from './SymmetryGuide.module.css';

/** Projects document-owned symmetry guides over the canvas, without adding them to pixels, exports or history. */
export function SymmetryGuide(props: {
  symmetry: PaintSymmetry;
  camera: Camera;
  size: ViewSize;
  /** The current tool paints symmetric copies; inactive guides are dimmed. */
  active: boolean;
}) {
  const path = () => {
    const { symmetry, camera, size } = props;
    const extent =
      Math.hypot(size.width, size.height) / camera.zoom + Math.hypot(symmetry.x - camera.x, symmetry.y - camera.y);
    return symmetryGuide(symmetry, extent)
      .map((line) => {
        const a = worldToScreen(line[0], camera, size);
        const b = worldToScreen(line[1], camera, size);
        return `M${a.x},${a.y}L${b.x},${b.y}`;
      })
      .join('');
  };

  return (
    <Show when={props.symmetry.visible && props.symmetry.mode !== 'off'}>
      <svg class={styles.symmetryGuide} aria-label="Paint symmetry guide" data-active={props.active}>
        <path d={path()} fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="6 5" />
      </svg>
    </Show>
  );
}
