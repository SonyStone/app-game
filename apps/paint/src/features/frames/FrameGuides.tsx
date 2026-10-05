import type { Point } from '@app-game/paint-core/camera';
import { For } from 'solid-js';
import styles from './Frames.module.css';
import type { Frame } from './framesFeature';

/**
 * Outlines of the frames over the canvas, with their names at their top-left corners: the active frame solid, the
 * others dashed. Turns and mirrors with the view; ignores the pointer.
 */
export function FrameGuides(props: {
  frames: readonly Frame[];
  activeId: string | undefined;
  /** Document point to CSS pixels of the canvas. */
  toScreen: (point: Point) => Point;
}) {
  return (
    <svg class={styles.guides} aria-hidden="true">
      <For each={props.frames}>
        {(frame) => {
          const corners = () =>
            [
              { x: frame.left, y: frame.top },
              { x: frame.left + frame.width, y: frame.top },
              { x: frame.left + frame.width, y: frame.top + frame.height },
              { x: frame.left, y: frame.top + frame.height }
            ].map(props.toScreen);
          return (
            <g data-active={frame.id === props.activeId ? 'true' : 'false'}>
              <polygon
                points={corners()
                  .map(({ x, y }) => `${x},${y}`)
                  .join(' ')}
              />
              <text x={corners()[0]!.x} y={corners()[0]!.y - 6}>
                {frame.name}
              </text>
            </g>
          );
        }}
      </For>
    </svg>
  );
}
