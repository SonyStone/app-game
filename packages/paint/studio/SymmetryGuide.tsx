import { Show } from 'solid-js';
import { worldToScreen } from './camera';
import type { PaintSession } from './createPaintSession';
import { supportsPaintSymmetry, symmetryGuide } from './symmetry';

/** Projects document-owned symmetry guides without adding them to GPU pixels, exports or history. */
export function SymmetryGuide(props: { session: PaintSession }) {
  const visible = () => props.session.symmetry().visible && props.session.symmetry().mode !== 'off';
  const active = () => supportsPaintSymmetry(props.session.brush()) && props.session.tool() !== 'lasso';
  const path = () => {
    const symmetry = props.session.symmetry(),
      camera = props.session.camera(),
      size = props.session.size();
    const extent =
      Math.hypot(size.width, size.height) / camera.zoom + Math.hypot(symmetry.x - camera.x, symmetry.y - camera.y);
    return symmetryGuide(symmetry, extent)
      .map((line) => {
        const a = worldToScreen(line[0], camera, size),
          b = worldToScreen(line[1], camera, size);
        return `M${a.x},${a.y}L${b.x},${b.y}`;
      })
      .join('');
  };
  return (
    <Show when={visible()}>
      <svg class="paint-symmetry-guide" aria-label="Paint symmetry guide" data-active={active()}>
        <path d={path()} fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="6 5" />
      </svg>
    </Show>
  );
}
