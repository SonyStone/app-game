export const createSavePointerEvents = () => {
  const asPointerEvent = (e: PointerEvent) => ({
    timeStamp: Math.trunc(e.timeStamp),
    type: e.type,
    twist: e.twist,
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    buttons: e.buttons,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    x: e.x,
    y: e.y,
    shiftKey: e.shiftKey,
    movementX: e.movementX,
    movementY: e.movementY,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    pressure: e.pressure,
    tildX: e.tiltX,
    tildY: e.tiltY
  });
  const events: ReturnType<typeof asPointerEvent>[] = [];

  return {
    first: (e: PointerEvent) => {
      events.length = 0;
      events.push(asPointerEvent(e));
    },
    add: (e: PointerEvent) => {
      events.push(asPointerEvent(e));
    },
    get: () => {
      return events;
    }
  };
};
