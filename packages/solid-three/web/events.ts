import { createEvents, EventManager, Events } from '../core/events';
import { ThreeStore } from '../core/store';

const DOM_EVENTS = {
  onClick: ['click', false],
  onContextMenu: ['contextmenu', false],
  onDoubleClick: ['dblclick', false],
  onWheel: ['wheel', true],
  onPointerDown: ['pointerdown', true],
  onPointerUp: ['pointerup', true],
  onPointerLeave: ['pointerleave', true],
  onPointerMove: ['pointermove', true],
  onPointerCancel: ['pointercancel', true],
  onLostPointerCapture: ['lostpointercapture', true]
} as const;

export function createPointerEvents(_store: ThreeStore): EventManager<HTMLElement> {
  const { handlePointer } = createEvents(_store);

  return {
    connected: false,
    handlers: Object.keys(DOM_EVENTS).reduce(
      (acc, key) => ({ ...acc, [key]: handlePointer(key) }),
      {}
    ) as unknown as Events,
    connect: (target: HTMLElement) => {
      const [store, setStore] = _store;
      const { events } = store;
      events.disconnect?.();
      setStore('events', (events) => ({ ...events, connected: target }));
      Object.entries(events?.handlers ?? []).forEach(([name, event]) => {
        const [eventName, passive] = DOM_EVENTS[name as keyof typeof DOM_EVENTS];
        target.addEventListener(eventName, event, { passive });
      });
    },
    disconnect: () => {
      const [store, setStore] = _store;
      const { events } = store;
      if (events.connected) {
        Object.entries(events.handlers ?? []).forEach(([name, event]) => {
          if (events && events.connected instanceof HTMLElement) {
            const [eventName] = DOM_EVENTS[name as keyof typeof DOM_EVENTS];
            events.connected.removeEventListener(eventName, event);
          }
        });
        setStore('events', (events) => ({ ...events, connected: false }));
      }
    }
  };
}
