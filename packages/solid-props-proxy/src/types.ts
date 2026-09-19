import type { ComponentProps, JSX } from '@solidjs/web';

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

/** Combines an original value with active proxy layers for stackable DOM values. */
export type ProxyValueCombiner = (base: unknown, layers: readonly unknown[]) => unknown;

/** Exact structural matches avoid mixing generic HTMLElement event handlers into specific element props. */
type ElementTagName<T extends Element> = Extract<
  | {
      [Key in keyof HTMLElementTagNameMap]: T extends HTMLElementTagNameMap[Key]
        ? HTMLElementTagNameMap[Key] extends T
          ? Key
          : never
        : never;
    }[keyof HTMLElementTagNameMap]
  | {
      [Key in keyof SVGElementTagNameMap]: T extends SVGElementTagNameMap[Key]
        ? SVGElementTagNameMap[Key] extends T
          ? Key
          : never
        : never;
    }[keyof SVGElementTagNameMap],
  keyof JSX.IntrinsicElements
>;

/** JSX props for a known element instance, falling back to generic HTML attributes. */
type ElementProps<T extends Element> = [ElementTagName<T>] extends [never]
  ? JSX.HTMLAttributes<T>
  : ComponentProps<ElementTagName<T>>;

/** Explicit properties for custom elements and standard XML namespaces. */
export type ProxyNamespacedProps = {
  [Key in `prop:${string}` | `xlink:${string}` | `xml:${string}` | 'xmlns:xlink']?: unknown;
};

/**
 * Solid 2 props for an existing target. Children are never applied by this package.
 * Removed Solid 1 namespaces and className are not part of this interface.
 */
export type Props<P extends object = HTMLElement> = Partial<P extends Element ? ElementProps<P> : P> &
  (P extends Element ? ProxyNamespacedProps : {});
