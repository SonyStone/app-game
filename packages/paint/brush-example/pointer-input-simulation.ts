export const createSimulatePointerInput = () => {
  const eventInit: EventInit = {
    bubbles: true,
    cancelable: true,
    composed: true
  };

  // https://developer.mozilla.org/en-US/docs/Web/API/UIEvent/UIEvent
  const uiEventInit: UIEventInit = {
    detail: 0,
    view: window,
    which: 1
  };

  const eventModifierInit: EventModifierInit = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    // modifierAltGraph?: boolean;
    // modifierCapsLock?: boolean;
    // modifierFn?: boolean;
    // modifierFnLock?: boolean;
    // modifierHyper?: boolean;
    // modifierNumLock?: boolean;
    // modifierScrollLock?: boolean;
    // modifierSuper?: boolean;
    // modifierSymbol?: boolean;
    // modifierSymbolLock?: boolean;
    shiftKey: false
  };

  // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent
  const mouseEventInit: MouseEventInit = {
    button: 0,
    buttons: 1,
    clientX: 304,
    clientY: 565,
    movementX: 0,
    movementY: 0,
    relatedTarget: null,
    screenX: 3185,
    screenY: 654
  };

  // https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/PointerEvent
  const pointerEventInit: PointerEventInit = {
    // coalescedEvents
    height: 1,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
    // predictedEvents
    pressure: 0.5,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    width: 1
  };

  const event = new PointerEvent('pointerdown', {
    ...eventInit,
    ...uiEventInit,
    ...eventModifierInit,
    ...mouseEventInit,
    ...pointerEventInit
  });

  return event;
};
