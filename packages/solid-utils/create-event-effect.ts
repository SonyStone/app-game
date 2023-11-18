import { createEffect, onCleanup } from 'solid-js';

import { EventWith, TypedEventTarget } from './event-with';

export function createEventEffect<E extends keyof WindowEventMap>(
  target: Window,
  event: E,
  listener: (event: EventWith<WindowEventMap[E], typeof target>) => void,
  options?: AddEventListenerOptions
): void;

export function createEventEffect<E extends keyof DocumentEventMap>(
  target: Document,
  event: E,
  listener: (event: EventWith<DocumentEventMap[E], typeof target>) => void,
  options?: AddEventListenerOptions
): void;

export function createEventEffect<
  T extends Element,
  E extends keyof HTMLElementEventMap
>(
  target: T,
  event: E,
  listener: (event: EventWith<HTMLElementEventMap[E], typeof target>) => void,
  options?: AddEventListenerOptions
): void;

export function createEventEffect<
  E extends Event,
  T extends TypedEventTarget<EventWith<E, T>>
>(
  target: T,
  event: string,
  listener: (event: EventWith<E, T>) => void,
  options?: AddEventListenerOptions
): void;

export function createEventEffect<E extends Event>(
  target: TypedEventTarget<E>,
  event: string,
  listener: (event: E) => void,
  options?: AddEventListenerOptions
): void;

export function createEventEffect<E extends Event>(
  target: TypedEventTarget<E>,
  event: string,
  listener: (event: E) => void,
  options: AddEventListenerOptions = {}
): void {
  createEffect(() => {
    target.addEventListener(event, listener as any, options);
  });

  onCleanup(() => {
    target.removeEventListener(event, listener as any, options);
  });
}
