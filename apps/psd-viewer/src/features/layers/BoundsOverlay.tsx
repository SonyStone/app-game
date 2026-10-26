import type { PsdRect } from '@app-game/psd/viewer';
import type { View } from '../viewport/view';

/** Pointer-transparent saved-record bounds. Comp/frame transforms are not inferred. */
export function BoundsOverlay(props: { bounds: PsdRect; view: View }) {
  return (
    <div
      role="img"
      aria-label="Selected layer saved bounds"
      style={{
        position: 'absolute',
        'pointer-events': 'none',
        border: '2px solid #55c9ff',
        left: `${props.view.x + props.bounds.left * props.view.scale}px`,
        top: `${props.view.y + props.bounds.top * props.view.scale}px`,
        width: `${Math.max(1, (props.bounds.right - props.bounds.left) * props.view.scale)}px`,
        height: `${Math.max(1, (props.bounds.bottom - props.bounds.top) * props.view.scale)}px`
      }}
    />
  );
}
