import { makeEventListener } from '@solid-primitives/event-listener';
import {
  DelegatedEvents,
  delegateEvents,
  getDelegatedRoot,
  registerDelegatedContainer,
  unregisterDelegatedContainer
} from '@solidjs/web';
import { runWithOwner } from 'solid-js';
import type { AnyRecord, Cleanup, SolidEventHandler, SolidEventTupleHandler } from './types';
import { noop, readEventTuple, withCleanupUpdate } from './utils';

/**
 * Adds an independent native listener. It never locks other subscriptions.
 * The caller owns the returned cleanup; listener objects may supply native options.
 */
export function setEventListener(element: Element, name: string, value: unknown, capture: boolean): Cleanup {
  if (!value) return noop;
  const tuple = readEventTuple(value);
  const options =
    typeof value === 'object' && !tuple
      ? {
          capture: capture || Boolean((value as AddEventListenerOptions).capture),
          passive: (value as AddEventListenerOptions).passive,
          once: (value as AddEventListenerOptions).once,
          signal: (value as AddEventListenerOptions).signal
        }
      : capture;
  const listener = (event: Event) => {
    if (tuple) tuple.handler.call(element, tuple.data, event);
    else if (typeof value === 'function') value.call(element, event);
    else (value as EventListenerObject).handleEvent(event);
  };
  // Prop removal, target replacement, and final disposal all share this one cleanup.
  return runWithOwner(null, () => makeEventListener(element, name, listener, options));
}

/** Applies a Solid event prop, using delegated storage when Solid delegates the event. */
export function setSolidEvent(element: Element, name: string, value: unknown): Cleanup {
  if (DelegatedEvents.has(name)) {
    return setDelegatedEvent(element, name, value);
  }

  return setEventListener(element, name, value, false);
}

/**
 * Adds a Solid 2 delegated handler layer, preserving base updates and layer order.
 * Targets outside render roots acquire a local delegated container until cleanup.
 */
export function setDelegatedEvent(element: Element, name: string, value: unknown): Cleanup {
  if (!value) return noop;
  let events = delegatedPatches.get(element);
  if (!events) delegatedPatches.set(element, (events = new Map()));
  let patch = events.get(name);
  if (!patch) {
    patch = createDelegatedPatch(element, name);
    events.set(name, patch);
  }
  const current = patch;
  const layer: { value: unknown; active: boolean } = { value, active: true };
  current.layers.push(layer);
  delegateEvents([name]);

  return withCleanupUpdate(
    () => {
      if (!layer.active) return;
      layer.active = false;
      current.layers.splice(current.layers.indexOf(layer), 1);
      if (!current.layers.length) {
        current.dispose();
        events.delete(name);
        if (!events.size) delegatedPatches.delete(element);
      }
    },
    (next) => {
      layer.value = next;
      return true;
    }
  );
}

/**
 * Prefix of the element slots read by @solidjs/web's delegated event dispatcher.
 *
 * Solid stores a delegated handler at `_$$<event>` and tuple data at `_$$<event>Data`
 * (2.0.0-rc.13; rc.4 used `$$<event>`). The runtime does not export this key, so it is
 * mirrored here and verified against compiled JSX by the delegation tests.
 */
export const DELEGATED_EVENT_KEY = '_$$';

/** Installs the handler/data slots that the installed Solid 2 event dispatcher reads. */
function createDelegatedPatch(element: Element, name: string) {
  const record = element as unknown as AnyRecord;
  const handlerKey = `${DELEGATED_EVENT_KEY}${name}`;
  const dataKey = `${handlerKey}Data`;
  const handlerDescriptor = Object.getOwnPropertyDescriptor(element, handlerKey);
  const dataDescriptor = Object.getOwnPropertyDescriptor(element, dataKey);
  let baseHandler = record[handlerKey];
  let baseData = record[dataKey];
  let handlerWritten = false;
  let dataWritten = false;
  const layers: { value: unknown; active: boolean }[] = [];
  const localContainer = !getDelegatedRoot(element);
  const handler = (event: Event) => {
    if (baseHandler) {
      callSolidEventHandler(element, baseHandler, baseData, event);
    }
    for (const layer of layers.slice()) {
      if (!layer.active) continue;
      const tuple = readEventTuple(layer.value);
      if (tuple) tuple.handler.call(element, tuple.data, event);
      else if (typeof layer.value === 'function') layer.value.call(element, event);
    }
  };
  Object.defineProperty(element, handlerKey, {
    configurable: true,
    get: () => handler,
    set: (next) => {
      baseHandler = next;
      handlerWritten = true;
    }
  });
  Object.defineProperty(element, dataKey, {
    configurable: true,
    get: () => undefined,
    set: (next) => {
      baseData = next;
      dataWritten = true;
    }
  });
  if (localContainer) registerDelegatedContainer(element);

  return {
    layers,
    dispose() {
      restoreSlot(element, handlerKey, handlerDescriptor, baseHandler, handlerWritten);
      restoreSlot(element, dataKey, dataDescriptor, baseData, dataWritten);
      if (localContainer) unregisterDelegatedContainer(element);
    }
  };
}

/** Restores slot descriptors and keeps writes made by the owning Solid render effect. */
function restoreSlot(
  element: Element,
  key: string,
  descriptor: PropertyDescriptor | undefined,
  value: unknown,
  written: boolean
): void {
  if (descriptor) Object.defineProperty(element, key, descriptor);
  else Reflect.deleteProperty(element, key);
  if (written) (element as unknown as AnyRecord)[key] = value;
}

const delegatedPatches = new WeakMap<Element, Map<string, ReturnType<typeof createDelegatedPatch>>>();

/**
 * Calls a base delegated slot like the installed dispatcher: tuple data first when
 * present, otherwise a plain handler function or an EventListenerObject.
 */
function callSolidEventHandler(element: Element, handler: unknown, data: unknown, event: Event): void {
  if (data !== undefined) {
    (handler as SolidEventTupleHandler).call(element, data, event);
    return;
  }

  if (typeof handler === 'function') {
    (handler as SolidEventHandler).call(element, event);
    return;
  }

  (handler as EventListenerObject).handleEvent(event);
}
