import type { ComponentProps, JSX } from 'solid-js';

/** Object record used for dynamic prop and DOM slot access. */
export type AnyRecord = Record<string, unknown>;

/** Disposer returned by a temporary prop, attribute, property, or listener patch. */
export type Cleanup = () => void;

/** Cleanup that can update its applied value without being fully recreated. */
export type UpdatableCleanup = Cleanup & {
  /** Attempts to update the applied value in place. */
  update?: (value: unknown) => boolean;
};

/** Solid delegated event tuple shape: handler plus stable user data. */
export type EventTuple = readonly [handler: (data: unknown, event: Event) => void, data: unknown];

/** Solid-style event handler that receives only the DOM event. */
export type SolidEventHandler = (event: Event) => void;

/** Solid-style tuple handler that receives tuple data before the DOM event. */
export type SolidEventTupleHandler = (data: unknown, event: Event) => void;

/** String attribute value, or null when the attribute should be removed. */
export type AttributeValue = string | null;

/** Event listener options accepted by both native and proxy listener paths. */
export type EventOptions = boolean | AddEventListenerOptions | EventListenerOptions | undefined;

/** Combines an original value with active proxy layers for stackable DOM values. */
export type ProxyValueCombiner = (base: unknown, layers: readonly unknown[]) => unknown;

/** Intrinsic element name that best matches an element instance type. */
type ElementTagName<T extends Element> = Extract<
  | {
      [Key in keyof HTMLElementTagNameMap]: T extends HTMLElementTagNameMap[Key] ? Key : never;
    }[keyof HTMLElementTagNameMap]
  | {
      [Key in keyof SVGElementTagNameMap]: T extends SVGElementTagNameMap[Key] ? Key : never;
    }[keyof SVGElementTagNameMap],
  keyof JSX.IntrinsicElements
>;

/** JSX props for a known element instance, falling back to generic HTML attributes. */
type ElementProps<T extends Element> = [ElementTagName<T>] extends [never]
  ? JSX.HTMLAttributes<T>
  : ComponentProps<ElementTagName<T>>;

/** Values accepted by proxy-specific event namespace props. */
type ProxyEventValue = EventListenerOrEventListenerObject | EventTuple | null | undefined;

/** Extra prop namespaces handled by the proxy in addition to normal Solid props. */
export type ProxyNamespacedProps = {
  [Key in `on:${string}` | `oncapture:${string}`]?: ProxyEventValue;
} & {
  [Key in `attr:${string}` | `bool:${string}` | `prop:${string}`]?: unknown;
} & {
  className?: string | undefined;
};

/** SVG namespaced attributes such as xlink:href accepted for SVG targets. */
export type SVGNamespacedProps = {
  [Key in `${string}:${string}`]?: unknown;
};

/** Prop bag accepted by PropsProxy and createSpread for DOM elements or plain objects. */
export type Props<P extends object = HTMLElement> = Partial<P extends Element ? ElementProps<P> : P> &
  ProxyNamespacedProps &
  (P extends SVGElement ? SVGNamespacedProps : {});
