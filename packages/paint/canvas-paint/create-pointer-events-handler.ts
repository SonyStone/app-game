import { Vec2Tuple } from '@packages/math';
import { makeEventListener } from '@solid-primitives/event-listener';
import { Accessor, untrack } from 'solid-js';

export const createPointerEventsHandler = (props: {
  brushStroke: {
    add: (point: Vec2Tuple, opacity: number) => void;
    apply: () => void;
    render: () => void;
  };
  element: HTMLElement;
  updateOnEvent: Accessor<boolean>;
}) => {
  const element = props.element;
  const brushStroke = props.brushStroke;
  const updateOnEvent = props.updateOnEvent;

  makeEventListener(element, 'pointerdown', (e: PointerEvent) => {
    if (e.pressure === 0 || e.buttons !== 1) {
      return;
    }
    let x = e.clientX;
    let y = e.clientY;

    brushStroke.add([x, y], e.pressure);
  });
  makeEventListener(element, 'pointermove', (e: PointerEvent) => {
    const events = e.getCoalescedEvents();
    if (events.length === 0) {
      events.push(e);
    }
    for (const event of events) {
      if (e.pressure === 0 || e.buttons !== 1) {
        continue;
      }
      let x = event.clientX;
      let y = event.clientY;

      brushStroke.add([x, y], e.pressure);

      if (untrack(updateOnEvent)) {
        brushStroke.render();
      }
    }
  });

  makeEventListener(element, 'pointerup', (e) => {
    brushStroke.apply();
    if (untrack(updateOnEvent)) {
      brushStroke.render();
    }
  });
};
