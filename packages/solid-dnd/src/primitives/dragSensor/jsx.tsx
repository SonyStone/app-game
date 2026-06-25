import { createEventListener } from '@solid-primitives/event-listener';
import { resolveFirst } from '@solid-primitives/refs';
import { isClient } from '@solid-primitives/utils';
import { createContext, createEffect, type JSX, children as resolveChildren, useContext } from 'solid-js';
import {
  createDragSensorFactory,
  type CreateDragSensorOptions,
  type DragSensorFactory,
  type DragSensorFactoryOptions
} from '../createDragSensor';

/**
 * JSX/component-style drag sensor target.
 *
 * This is the most declarative experiment in this folder. It lets consumers wrap
 * the element that should receive `pointerdown`:
 *
 * ```tsx
 * <DragSensorJSX data={{ id }} onDragStart={handleStart}>
 *   <button>Drag me</button>
 * </DragSensorJSX>
 * ```
 *
 * Internally the component resolves `children` once, uses `resolveFirst` to find
 * the first child `HTMLElement`, attaches a native `pointerdown` listener to
 * that element, and returns the same resolved children. The wrapper does not
 * render an extra DOM node.
 *
 * A target can either receive an explicit `scope`, inherit one from
 * `<DragSensorJSX.Scope>`, or create a private one-target scope as a fallback.
 */
export type DragSensorJSXProps<TData = unknown, TElement extends HTMLElement = HTMLElement> = CreateDragSensorOptions<
  TData,
  TElement
> & {
  /**
   * Shared drag coordinator. Usually this comes from `<DragSensorJSX.Scope>`.
   *
   * Pass this manually only when the target is outside the JSX scope tree but
   * should still participate in the same single active drag session.
   */
  scope?: DragSensorFactory;
  /**
   * Children to render unchanged.
   *
   * The first resolved `HTMLElement` becomes the drag source element. Text,
   * fragments, and non-element children are ignored until an element is found.
   */
  children?: JSX.Element;
};

/**
 * Props for the JSX scope component.
 *
 * The scope creates one shared drag coordinator for all nested targets. This is
 * the recommended shape when a list, tabs row, tree, toolbar, or similar group
 * should allow only one active drag session at a time.
 */
export type DragSensorJSXScopeProps = DragSensorFactoryOptions & {
  /**
   * Either normal JSX children or a render function that receives the shared
   * scope object.
   *
   * The render function form is useful when sibling UI needs read access to
   * `scope.activeSource()`, `scope.delta()`, or `scope.isDragging()`.
   */
  children?: JSX.Element | ((scope: DragSensorFactory) => JSX.Element);
};

/**
 * Callable component with a nested `Scope` component.
 *
 * ```tsx
 * <DragSensorJSX.Scope threshold={6}>
 *   {(scope) => (
 *     <>
 *       <DragSensorJSX data={{ index }}>
 *         <button>Tab</button>
 *       </DragSensorJSX>
 *       <Overlay source={scope.activeSource()} />
 *     </>
 *   )}
 * </DragSensorJSX.Scope>
 * ```
 */
export type DragSensorJSXComponent = {
  <TData = unknown, TElement extends HTMLElement = HTMLElement>(
    props: DragSensorJSXProps<TData, TElement>
  ): JSX.Element;
  Scope: (props: DragSensorJSXScopeProps) => JSX.Element;
};

const DragSensorJSXContext = createContext<DragSensorFactory>();

/**
 * Target component implementation.
 *
 * Design notes:
 * - Uses native `addEventListener` because the child element is discovered at
 *   runtime with `resolveFirst`.
 * - Does not add DOM. Layout and CSS selectors see only the original child.
 * - Cleans up the listener whenever the resolved child changes or unmounts.
 * - Shares drag state through context when rendered inside
 *   `<DragSensorJSX.Scope>`.
 */
function DragSensorTarget<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  props: DragSensorJSXProps<TData, TElement>
): JSX.Element {
  const scope = props.scope ?? useContext(DragSensorJSXContext) ?? createDragSensorFactory();
  const sensor = scope.createSensor<TData, TElement>(props);
  const resolved = resolveChildren(() => props.children);
  const element = resolveFirst(
    resolved,
    (item): item is TElement => isHTMLElement(item),
    (item): item is TElement => isHTMLElement(item)
  );

  createEffect(() => {
    const target = element();

    if (!target) {
      return;
    }

    createEventListener(target, 'pointerdown', sensor.onPointerDown);
  });

  return resolved();
}

/**
 * Creates a shared drag scope for nested JSX targets.
 *
 * Use this when many targets should coordinate through one active pointer
 * session. For example, tabs in the same tabstrip should share a scope; unrelated
 * drag areas can use separate scopes.
 */
function DragSensorScope(props: DragSensorJSXScopeProps): JSX.Element {
  const scope = createDragSensorFactory(props);
  const child = props.children;

  return (
    <DragSensorJSXContext.Provider value={scope}>
      {typeof child === 'function' ? child(scope) : child}
    </DragSensorJSXContext.Provider>
  );
}

/**
 * Client-safe HTMLElement predicate for `resolveFirst`.
 *
 * On the server, `HTMLElement` may not exist, so this intentionally returns
 * `false` outside the client.
 */
function isHTMLElement(value: unknown): value is HTMLElement {
  return isClient && value instanceof HTMLElement;
}

/**
 * JSX drag sensor experiment.
 *
 * Prefer this variant when the desired call site is wrapper-shaped and the
 * target is naturally expressed as JSX:
 *
 * ```tsx
 * <DragSensorJSX.Scope threshold={6}>
 *   <DragSensorJSX onDragStart={handleStart}>
 *     <button>Drag me</button>
 *   </DragSensorJSX>
 * </DragSensorJSX.Scope>
 * ```
 */
export const DragSensorJSX = Object.assign(DragSensorTarget, {
  Scope: DragSensorScope
}) satisfies DragSensorJSXComponent;
