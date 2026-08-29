import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal } from 'solid-js';

type Vec2Tuple = [number, number];

export default function useDrag(target: () => HTMLElement | SVGElement | undefined) {
  const [state, setState] = createSignal({
    domDragStarted: false,
    startPos: [0, 0] as Vec2Tuple,
    detected: false,
    totalDistanceMoved: 0,
    dragMovement: [0, 0] as Vec2Tuple,
    movement: [0, 0] as Vec2Tuple
  });

  function dragStartHandler(event: PointerEvent) {
    event.stopPropagation();
    event.preventDefault();

    setState({
      domDragStarted: true,
      startPos: [event.clientX, event.clientY],
      detected: false,
      totalDistanceMoved: 0,
      dragMovement: [0, 0] as Vec2Tuple,
      movement: [0, 0] as Vec2Tuple
    });
  }

  function dragHandler(event: PointerEvent) {
    const distanceMoved = Math.abs(event.movementY) + Math.abs(event.movementX);

    setState((state) => ({
      domDragStarted: true,
      detected: true,
      startPos: state.startPos,
      totalDistanceMoved: state.totalDistanceMoved + distanceMoved,
      dragMovement: [state.dragMovement[0] + event.movementX, state.dragMovement[1] + event.movementY],
      movement: [event.movementX, event.movementY]
    }));
  }

  function dragEndHandler(event: PointerEvent) {
    setState((state) => ({ ...state, domDragStarted: false }));
  }

  createEventListener(() => (state().domDragStarted ? undefined : target()), 'pointerdown', dragStartHandler);
  createEventListener(() => (state().domDragStarted ? document : undefined), 'pointermove', dragHandler);
  createEventListener(() => (state().domDragStarted ? document : undefined), 'pointerup', dragEndHandler);
  createEventListener(() => (state().domDragStarted ? document : undefined), 'pointercancel', dragEndHandler);

  return state;
}
