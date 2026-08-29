import { createSignal, createTrackedEffect } from 'solid-js';

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

    activeTarget?.removeEventListener('pointerdown', dragStartHandler as EventListener);
    addDragListeners();
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
    removeDragListeners();

    setState((state) => ({ ...state, domDragStarted: false }));

    activeTarget?.addEventListener('pointerdown', dragStartHandler as EventListener);
  }

  function addDragListeners() {
    document.addEventListener('pointermove', dragHandler);
    document.addEventListener('pointerup', dragEndHandler);
    document.addEventListener('pointercancel', dragEndHandler);
  }

  function removeDragListeners() {
    document.removeEventListener('pointermove', dragHandler);
    document.removeEventListener('pointerup', dragEndHandler);
    document.removeEventListener('pointercancel', dragEndHandler);
  }

  let activeTarget: HTMLElement | SVGElement | undefined;
  createTrackedEffect(() => {
    activeTarget = target();
    if (!activeTarget) return;
    activeTarget.addEventListener('pointerdown', dragStartHandler as EventListener);

    return () => {
      activeTarget?.removeEventListener('pointerdown', dragStartHandler as EventListener);
      removeDragListeners();
    };
  });

  return state;
}
