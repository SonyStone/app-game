import { Vec2Tuple } from 'ogl';
import { ComponentProps, createEffect, createMemo, onMount } from 'solid-js';
import useDrag from './use-drag';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'resize-handle': ComponentProps<'div'> & { 'attr:which': string };
    }
  }
}

const BASE =
  ":uno: absolute after:absolute after:-inset-4 after:block after:content-['_'] opacity-0 bg-[#478698] hover:opacity-100 [&.isHighlighted]:opacity-70 [&.isDragging]:opacity-100";

const HORIZONTAL = 'left-0 right-0 h-1';
const VERTICAL = '-top-1px -bottom-1px w-1';
const ANGLE = 'z-10 w-4 h-4';

const Top = [BASE, HORIZONTAL, ':uno: -top-1px cursor-ns-resize'].join(' ');
const Bottom = [BASE, HORIZONTAL, ':uno: -bottom-1px cursor-ns-resize'].join(' ');
const Left = [BASE, VERTICAL, ':uno: -left-1px cursor-ew-resize'].join(' ');
const Right = [BASE, VERTICAL, ':uno: right-1px cursor-ew-resize'].join(' ');
const TopLeft = [BASE, ANGLE, ':uno: top-0 left-0 rounded-rb cursor-nw-resize'].join(' ');
const TopRight = [BASE, ANGLE, ':uno: top-0 right-0 rounded-lb cursor-ne-resize'].join(' ');
const BottomLeft = [BASE, ANGLE, ':uno: bottom-0 left-0 rounded-rt cursor-sw-resize'].join(' ');
const BottomRight = [BASE, ANGLE, ':uno: bottom-0 right-0 rounded-lt cursor-se-resize'].join(' ');

const comps = {
  Top,
  Bottom,
  Left,
  Right,
  TopLeft,
  TopRight,
  BottomLeft,
  BottomRight
};

type Which = keyof typeof comps;

export default function PanelResizeHandle(props: { which: Which; onDrag?: (vec: Vec2Tuple) => void }) {
  let element!: HTMLElement;

  onMount(() => {
    const drag = useDrag(element);

    createEffect(() => {
      const { domDragStarted, startPos, detected, totalDistanceMoved, dragMovement, movement } = drag();

      const which = props.which;

      props.onDrag?.(movement);

      if (domDragStarted) {
        if (which.startsWith('Bottom')) {
          // Math.max(dragMovement, )
          console.log(`dragMovement`, movement[1]);
        } else if (which.startsWith('Top')) {
          console.log(`dragMovement`, movement[1]);
        }
      }
    });
  });

  const isDragging = createMemo(() => false);

  const boundsHighlighted = createMemo(() => false);
  /** string 'Bottom' is 6, angle 'TopLeft' is 7 */
  const isOnCorner = createMemo(() => props.which.length <= 6);

  return (
    <resize-handle
      ref={(ref) => (element = ref)}
      attr:which={props.which}
      class={[
        comps[props.which],
        isDragging() ? 'isDragging' : '',
        boundsHighlighted() && isOnCorner() ? 'isHighlighted' : ''
      ].join(' ')}
    />
  );
}
