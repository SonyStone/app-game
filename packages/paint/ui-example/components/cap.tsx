import { createPointerListeners } from '@solid-primitives/pointer';
import { ComponentProps, createMemo, createSignal, Show } from 'solid-js';
import { toFixed } from '../utils';

/**
 * Cap component for rendering a cap shape based on given properties.
 */
export const Cap = (
  props: {
    x: number;
    y: number;
    radius: number;
    horizontalMove: number;
    up?: boolean;
    isActive?: boolean;
  } & ComponentProps<'path'> &
    ComponentProps<'circle'>
) => {
  const adjacent = createMemo(
    () => props.radius - Math.sqrt(props.radius * props.radius - props.horizontalMove * props.horizontalMove)
  );
  const x1 = createMemo(() => toFixed(props.x - props.radius + adjacent()));
  const y1 = createMemo(() => toFixed(props.y + props.horizontalMove));
  const x2 = createMemo(() => toFixed(props.x + props.radius - adjacent()));
  const y2 = createMemo(() => toFixed(props.y + props.horizontalMove));

  const [hovering, setHovering] = createSignal(false);
  const [active, setActive] = createSignal(false);

  const pointerHover = (target: SVGPathElement) =>
    createPointerListeners({
      target,
      onOver: () => setHovering(true),
      onEnter: () => setHovering(true),
      onDown: () => setHovering(true),
      onOut: () => setHovering(false),
      onLeave: () => setHovering(false),
      onUp: () => setHovering(false)
    });

  const pointerActive = (target: SVGPathElement) =>
    createPointerListeners({
      target,
      onDown: (e) => {
        const element = e.target as SVGElement;
        element.setPointerCapture(e.pointerId);
        setActive(true);
      },
      onUp: (e) => {
        const element = e.target as SVGElement;
        element.releasePointerCapture(e.pointerId);
        setActive(false);
      }
    });

  const classList = createMemo(() => ({
    'pointer-events-auto': props.isActive,
    'pointer-events-none': !props.isActive,
    hover: hovering(),
    active: active()
  }));

  return (
    <>
      <Show when={props.horizontalMove < props.radius && props.horizontalMove > -props.radius}>
        <path
          {...props}
          ref={(ref) => {
            pointerHover(ref);
            pointerActive(ref);
          }}
          classList={classList()}
          d={`M ${x1()},${y1()}
            A ${props.radius} ${props.radius} 0 ${props.up ? 1 : 0} ${props.up ? 1 : 0} ${x2()},${y2()}
            z`}
        />
      </Show>
      <Show when={props.horizontalMove > props.radius}>
        <circle
          {...props}
          ref={(ref) => {
            pointerHover(ref);
            pointerActive(ref);
          }}
          classList={classList()}
          cx={props.x}
          cy={props.y}
          r={props.radius}
        />
      </Show>
    </>
  );
};
