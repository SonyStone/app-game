import { Vec2Tuple } from "ogl";
import { createSignal, onCleanup, untrack } from "solid-js"

export default function useDrag(
  target: HTMLElement | SVGElement,
) {
  const [state, setState] = createSignal({
    domDragStarted: false,
    startPos: [0, 0] as Vec2Tuple,
    detected: false,
    totalDistanceMoved: 0,
    dragMovement: [0, 0] as Vec2Tuple,
    movement: [0, 0] as Vec2Tuple,
  })

  function dragStartHandler(event: PointerEvent) {
    event.stopPropagation()
    event.preventDefault()

    setState({
      domDragStarted: true,
      startPos: [event.clientX, event.clientY],
      detected: false,
      totalDistanceMoved: 0,
      dragMovement: [0, 0] as Vec2Tuple,
      movement: [0, 0] as Vec2Tuple
    });

    (target as HTMLElement).removeEventListener('pointerdown', dragStartHandler)
    addDragListeners();
  }

  function dragHandler(event: PointerEvent) {

    const distanceMoved = Math.abs(event.movementY) + Math.abs(event.movementX)

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
    removeDragListeners()

    setState((state) => ({ ...state, domDragStarted: false }));

    (target as HTMLElement).addEventListener('pointerdown', dragStartHandler);
  }

  function addDragListeners() {
    document.addEventListener('pointermove', dragHandler)
    document.addEventListener('pointerup', dragEndHandler)
    document.addEventListener('pointercancel', dragEndHandler)
  }

  function removeDragListeners() {
    document.removeEventListener('pointermove', dragHandler)
    document.removeEventListener('pointerup', dragEndHandler)
    document.removeEventListener('pointercancel', dragEndHandler)
  }



  (target as HTMLElement).addEventListener('pointerdown', dragStartHandler)

  onCleanup(() => {
    removeDragListeners();
    (target as HTMLElement).removeEventListener('pointerdown', dragStartHandler)
  })

  return state;
}