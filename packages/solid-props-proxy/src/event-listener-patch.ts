import { DelegatedEvents, delegateEvents } from 'solid-js/web';
import type { AnyRecord, Cleanup, EventOptions, SolidEventHandler, SolidEventTupleHandler } from './types';
import { eventCapture, eventKey, isEqual, noop, readEventTuple, restoreObjectKey } from './utils';

/** Native listener registration captured while an event lock is active. */
type ListenerRecord = {
  /** Listener object passed to addEventListener. */
  listener: EventListenerOrEventListenerObject;
  /** Listener options passed to addEventListener. */
  options: EventOptions;
};

/** Queued native listener changes plus active lock count for one event phase. */
type EventState = {
  /** Listener registrations queued while the proxy owns the event. */
  queued: ListenerRecord[];
  /** Number of active proxy listeners for the same event phase. */
  locks: number;
};

/** Native event listener methods patched while a proxy listener is active. */
type EventListenerMethodMap = {
  addEventListener: Element['addEventListener'];
  removeEventListener: Element['removeEventListener'];
};

/** Key of a native event listener method. */
type EventListenerMethodKey = keyof EventListenerMethodMap;

/** Patched event listener method with restore metadata. */
type PatchedEventListenerMethod<Key extends EventListenerMethodKey> = {
  /** Original method captured from the element. */
  original: EventListenerMethodMap[Key];
  /** Own descriptor present before patching, if any. */
  descriptor: PropertyDescriptor | undefined;
  /** Proxy method that performs internal writes without queueing. */
  proxy: EventListenerMethodMap[Key];
  /** Descriptor installed while the patch is active. */
  property: PropertyDescriptor;
  /** Whether the method descriptor is currently installed on the element. */
  patched: boolean;
  /** Installs the patched method when it is not already active. */
  ensure: () => void;
  /** Restores the original method descriptor. */
  restore: () => void;
};

/** Patch controller for stackable native event listener overlays. */
export type EventListenerPatch = Pick<EventListenerPatchRecord, 'addEventListener' | 'removeEventListener' | 'lock'>;

const eventListenerPatches = new WeakMap<Element, EventListenerPatchRecord>();

/** Returns the shared event listener patch controller for an element. */
export function getEventListenerPatch(element: Element): EventListenerPatch {
  const existing = eventListenerPatches.get(element);

  if (existing) {
    return existing;
  }

  const patch = new EventListenerPatchRecord(element);

  eventListenerPatches.set(element, patch);
  return patch;
}

/**
 * Applies a native event listener overlay and returns a cleanup that removes it.
 *
 * While active, later user addEventListener calls for the same event phase are queued
 * and replayed after the overlay is cleaned up.
 */
export function setEventListener(
  element: Element,
  name: string,
  value: unknown,
  capture: boolean
): Cleanup {
  if (!value) {
    return noop;
  }

  const eventTuple = readEventTuple(value);
  const eventPatch = getEventListenerPatch(element);
  const addListener = eventPatch.addEventListener.proxy;
  const removeListener = eventPatch.removeEventListener.proxy;
  const releaseLock = eventPatch.lock(name, capture);

  if (eventTuple) {
    const listener = (event: Event) => eventTuple.handler.call(element, eventTuple.data, event);
    addListener(name, listener, capture);
    return () => {
      removeListener(name, listener, capture);
      releaseLock();
    };
  }

  const listener = value as EventListenerOrEventListenerObject;
  const listenerOptions: EventOptions = typeof value === 'function' ? capture : (value as EventOptions);
  addListener(name, listener, listenerOptions as AddEventListenerOptions | boolean);

  return () => {
    removeListener(name, listener, listenerOptions as EventListenerOptions | boolean);
    releaseLock();
  };
}

/** Applies a Solid event prop, using delegated storage when Solid delegates the event. */
export function setSolidEvent(element: Element, name: string, value: unknown): Cleanup {
  if (DelegatedEvents.has(name)) {
    return setDelegatedEvent(element, name, value);
  }

  return setEventListener(element, name, value, false);
}

/**
 * Applies a Solid delegated event by writing the $$event handler slots Solid reads.
 *
 * Existing delegated handlers are chained so the proxy behaves like an additional
 * spread layer instead of replacing user-owned behavior permanently.
 */
export function setDelegatedEvent(element: Element, name: string, value: unknown): Cleanup {
  const record = element as unknown as AnyRecord;
  const handlerKey = `$$${name}`;
  const dataKey = `$$${name}Data`;
  const hadHandler = Object.prototype.hasOwnProperty.call(record, handlerKey);
  const hadData = Object.prototype.hasOwnProperty.call(record, dataKey);
  const originalHandler = record[handlerKey];
  const originalData = record[dataKey];
  const eventTuple = readEventTuple(value);
  const nextHandler = eventTuple?.handler ?? (typeof value === 'function' ? (value as SolidEventHandler) : undefined);
  const nextData = eventTuple?.data;

  if (typeof originalHandler === 'function' && nextHandler) {
    record[handlerKey] = (event: Event) => {
      callSolidEventHandler(
        element,
        originalHandler as SolidEventHandler | SolidEventTupleHandler,
        originalData,
        hadData,
        event
      );
      callSolidEventHandler(element, nextHandler, nextData, Boolean(eventTuple), event);
    };
    delete record[dataKey];
  } else if (eventTuple) {
    record[handlerKey] = eventTuple.handler;
    record[dataKey] = eventTuple.data;
  } else {
    record[handlerKey] = value;
    delete record[dataKey];
  }

  safeDelegateEvents(name);

  const appliedHandler = record[handlerKey];
  const appliedData = record[dataKey];

  return () => {
    if (!isEqual(record[handlerKey], appliedHandler) || !isEqual(record[dataKey], appliedData)) {
      return;
    }

    restoreObjectKey(record, handlerKey, hadHandler, originalHandler);
    restoreObjectKey(record, dataKey, hadData, originalData);
  };
}

/** Own-property patch record for one native event listener method. */
class PatchedEventListenerMethodRecord<Key extends EventListenerMethodKey> implements PatchedEventListenerMethod<Key> {
  readonly original: EventListenerMethodMap[Key];
  readonly descriptor: PropertyDescriptor | undefined;
  readonly property: PropertyDescriptor;
  patched = false;

  constructor(
    private readonly element: Element,
    private readonly key: Key,
    readonly proxy: EventListenerMethodMap[Key],
    value: PropertyDescriptor['value']
  ) {
    this.original = element[key] as EventListenerMethodMap[Key];
    this.descriptor = Object.getOwnPropertyDescriptor(element, key);
    this.property = { configurable: true, value };
  }

  /** Installs the patched method on the element. */
  ensure(): void {
    if (this.patched) {
      return;
    }

    Object.defineProperty(this.element, this.key, this.property);
    this.patched = true;
  }

  /** Restores the method descriptor that existed before patching. */
  restore(): void {
    if (!this.patched) {
      return;
    }

    if (this.descriptor) {
      Object.defineProperty(this.element, this.key, this.descriptor);
    } else {
      Reflect.deleteProperty(this.element, this.key);
    }

    this.patched = false;
  }
}

/** Coordinates queued native listener changes for one element. */
class EventListenerPatchRecord {
  private proxyDepth = 0;
  private readonly states = new Map<string, EventState>();
  readonly addEventListener: PatchedEventListenerMethod<'addEventListener'>;
  readonly removeEventListener: PatchedEventListenerMethod<'removeEventListener'>;

  constructor(readonly element: Element) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalAddEventListener = element.addEventListener;
    const originalRemoveEventListener = element.removeEventListener;

    this.addEventListener = new PatchedEventListenerMethodRecord(
      element,
      'addEventListener',
      ((name: string, listener: EventListenerOrEventListenerObject, options?: EventOptions) =>
        self.runAsProxy(() =>
          originalAddEventListener.call(
            element,
            name,
            listener,
            options as AddEventListenerOptions | boolean | undefined
          )
        )) as Element['addEventListener'],
      function (
        this: Element,
        name: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: EventOptions
      ) {
        if (!listener) {
          return;
        }

        if (this !== element || self.proxyDepth > 0) {
          originalAddEventListener.call(this, name, listener, options as AddEventListenerOptions | boolean | undefined);
          return;
        }

        const state = self.states.get(eventKey(name, eventCapture(options)));

        if (!state || state.locks === 0) {
          originalAddEventListener.call(this, name, listener, options as AddEventListenerOptions | boolean | undefined);
          return;
        }

        state.queued.push({ listener, options });
      }
    );

    this.removeEventListener = new PatchedEventListenerMethodRecord(
      element,
      'removeEventListener',
      ((name: string, listener: EventListenerOrEventListenerObject, options?: EventOptions) =>
        self.runAsProxy(() =>
          originalRemoveEventListener.call(
            element,
            name,
            listener,
            options as EventListenerOptions | boolean | undefined
          )
        )) as Element['removeEventListener'],
      function (
        this: Element,
        name: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: EventOptions
      ) {
        if (!listener) {
          return;
        }

        if (this !== element || self.proxyDepth > 0) {
          originalRemoveEventListener.call(this, name, listener, options as EventListenerOptions | boolean | undefined);
          return;
        }

        const state = self.states.get(eventKey(name, eventCapture(options)));

        if (state) {
          state.queued = state.queued.filter((record) => record.listener !== listener);
        }

        originalRemoveEventListener.call(this, name, listener, options as EventListenerOptions | boolean | undefined);
      }
    );
  }

  /** Locks one event phase for a proxy layer and returns the release cleanup. */
  lock(name: string, capture: boolean): Cleanup {
    this.addEventListener.ensure();
    this.removeEventListener.ensure();

    const key = eventKey(name, capture);
    const state = this.states.get(key) ?? { queued: [], locks: 0 };

    state.locks += 1;
    this.states.set(key, state);

    return () => {
      state.locks -= 1;

      if (state.locks > 0) {
        return;
      }

      for (const record of state.queued) {
        this.addEventListener.proxy(
          name,
          record.listener,
          record.options as AddEventListenerOptions | boolean | undefined
        );
      }

      this.states.delete(key);
      this.maybeRestore();
    };
  }

  /** Restores native methods when no event states remain. */
  private maybeRestore(): void {
    if (this.states.size > 0) {
      return;
    }

    this.addEventListener.restore();
    this.removeEventListener.restore();
    eventListenerPatches.delete(this.element);
  }

  /** Runs an internal native listener operation without queueing it. */
  private runAsProxy<T>(run: () => T): T {
    this.proxyDepth += 1;

    try {
      return run();
    } finally {
      this.proxyDepth -= 1;
    }
  }
}

/** Registers delegated events and tolerates SSR-like Solid entries that expose a throwing stub. */
function safeDelegateEvents(name: string): void {
  try {
    delegateEvents([name]);
  } catch {
    // Solid's server entry exposes a client-only stub. The handler slots are still useful in tests/SSR-like runtimes.
  }
}

/** Calls either Solid delegated handler shape with the correct argument order. */
function callSolidEventHandler(
  element: Element,
  handler: SolidEventHandler | SolidEventTupleHandler,
  data: unknown,
  hasData: boolean,
  event: Event
): void {
  if (hasData) {
    (handler as SolidEventTupleHandler).call(element, data, event);
    return;
  }

  (handler as SolidEventHandler).call(element, event);
}
