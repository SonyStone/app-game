import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  createDragSensorFactory,
  type CreateDragSensorOptions,
  type DragSensorFactory,
  type DragSensorFactoryOptions,
  type DragSensorHandle
} from '../createDragSensor';

/**
 * Accessor accepted by the ref-binding variants.
 *
 * The target can be a plain element, a signal/accessor returning an element, or
 * `null`/`undefined` while the element is not mounted yet. The binding effect
 * attaches `pointerdown` when an element appears and removes it on cleanup.
 */
export type DragSensorTargetAccessor<TElement extends HTMLElement = HTMLElement> = MaybeAccessor<
  TElement | null | undefined
>;

/**
 * Sensor handle plus a Solid `ref` callback.
 *
 * This shape is useful when the caller wants one object that can both be passed
 * into JSX as `ref={drag.ref}` and read as a normal sensor handle.
 */
export type DragSensorRefBinding<TData = unknown, TElement extends HTMLElement = HTMLElement> = DragSensorHandle<
  TData,
  TElement
> & {
  /** Ref callback to assign to the draggable element. */
  ref: (element: TElement) => void;
  /** Current element captured by `ref`, mostly useful for debugging or measuring. */
  element: Accessor<TElement | undefined>;
};

/**
 * Options for the single-function binding experiment.
 *
 * This accepts the target-level drag callbacks/options and optionally controls
 * how the shared scope is chosen:
 * - `scope`: use an existing shared coordinator.
 * - `scopeOptions`: create a private coordinator with these defaults.
 * - `target`: bind to an existing element accessor instead of using the returned
 *   `ref` callback.
 */
export type DragSensorBindingOptions<TData = unknown, TElement extends HTMLElement = HTMLElement> =
  CreateDragSensorOptions<TData, TElement> & {
    /** Existing shared drag coordinator. */
    scope?: DragSensorFactory;
    /** Defaults for a private coordinator when `scope` is omitted. */
    scopeOptions?: DragSensorFactoryOptions;
    /** Optional element/accessor target. Omit to use the returned `ref`. */
    target?: DragSensorTargetAccessor<TElement>;
  };

/**
 * Creates an explicit shared drag scope.
 *
 * This is the primitive equivalent of `<DragSensorJSX.Scope>`. It is the most
 * transparent Solid-style option: create one scope for a group, then bind any
 * number of target sensors to it.
 *
 * ```tsx
 * const scope = createDragSensorScope({ threshold: 6 });
 * ```
 */
export function createDragSensorScope(options: DragSensorFactoryOptions = {}): DragSensorFactory {
  return createDragSensorFactory(options);
}

/**
 * Binds a target element/accessor to a shared scope.
 *
 * This is the clearest ref-based variant. The caller owns both pieces:
 * the shared scope and the DOM ref. That makes coordination explicit and keeps
 * JSX free of wrapper components.
 *
 * ```tsx
 * const scope = createDragSensorScope({ threshold: 6 });
 * let button!: HTMLButtonElement;
 *
 * const sensor = createDragSensorTarget(scope, () => button, {
 *   data: { index },
 *   onDragStart: handleStart
 * });
 *
 * return <button ref={button}>Tab</button>;
 * ```
 *
 * Use this when several targets should share one active drag session and the
 * caller wants to read shared scope state directly.
 */
export function createDragSensorTarget<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  scope: DragSensorFactory,
  target: DragSensorTargetAccessor<TElement>,
  options: CreateDragSensorOptions<TData, TElement> = {}
): DragSensorHandle<TData, TElement> {
  const sensor = scope.createSensor<TData, TElement>(options);

  createEffect(() => {
    const element = access(target);

    if (!element) {
      return;
    }

    element.addEventListener('pointerdown', sensor.onPointerDown);
    onCleanup(() => {
      element.removeEventListener('pointerdown', sensor.onPointerDown);
    });
  });

  return sensor;
}

/**
 * Creates a target binding with a private scope.
 *
 * This is shorter than `createDragSensorScope + createDragSensorTarget`, but it
 * intentionally isolates this target from other targets. Multiple calls create
 * multiple independent coordinators.
 *
 * ```tsx
 * let button!: HTMLButtonElement;
 *
 * createStandaloneDragSensorTarget(() => button, {
 *   onDragStart: handleStart
 * });
 * ```
 *
 * Use for one-off draggables. Avoid for lists/tabs where multitouch should be
 * coordinated across many targets.
 */
export function createStandaloneDragSensorTarget<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  target: DragSensorTargetAccessor<TElement>,
  options: CreateDragSensorOptions<TData, TElement> = {},
  scopeOptions: DragSensorFactoryOptions = {}
): DragSensorHandle<TData, TElement> {
  const scope = createDragSensorFactory(scopeOptions);
  return createDragSensorTarget(scope, target, options);
}

/**
 * Returns a ref callback and sensor handle in one object.
 *
 * This removes the need for a separate `let button` variable:
 *
 * ```tsx
 * const scope = createDragSensorScope({ threshold: 6 });
 * const drag = createDragSensorRef({ onDragStart: handleStart }, scope);
 *
 * return <button ref={drag.ref}>Tab</button>;
 * ```
 *
 * If `scope` is omitted, this creates a private scope. Pass a shared scope when
 * several returned refs should coordinate as one drag area.
 */
export function createDragSensorRef<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  options: CreateDragSensorOptions<TData, TElement> = {},
  scope: DragSensorFactory = createDragSensorFactory()
): DragSensorRefBinding<TData, TElement> {
  const [element, setElement] = createSignal<TElement>();
  const sensor = createDragSensorTarget(scope, element, options);

  return {
    ...sensor,
    ref: setElement,
    element
  };
}

/**
 * Single-function binding experiment.
 *
 * This function tries to cover the common ref-binding cases:
 * - pass `scope` to join an existing drag group,
 * - pass `scopeOptions` to create a private group,
 * - pass `target` to bind an existing element accessor,
 * - omit `target` and use the returned `ref` callback.
 *
 * ```tsx
 * const drag = createDragSensorBinding({
 *   scopeOptions: { threshold: 6 },
 *   data: { index },
 *   onDragStart: handleStart
 * });
 *
 * return <button ref={drag.ref}>Tab</button>;
 * ```
 *
 * This is convenient, but it hides more decisions than the explicit-scope API.
 */
export function createDragSensorBinding<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  options: DragSensorBindingOptions<TData, TElement> = {}
): DragSensorRefBinding<TData, TElement> & { scope: DragSensorFactory } {
  const scope = options.scope ?? createDragSensorFactory(options.scopeOptions);
  const [refElement, setRefElement] = createSignal<TElement>();
  const target = () => access(options.target) ?? refElement();
  const sensor = createDragSensorTarget(scope, target, options);

  return {
    ...sensor,
    ref: setRefElement,
    element: refElement,
    scope
  };
}

/**
 * Creates a Solid `use:` directive for drag targets.
 *
 * Directives keep markup flat and declarative:
 *
 * ```tsx
 * const scope = createDragSensorScope({ threshold: 6 });
 * const dragSensor = createDragSensorDirective(scope);
 *
 * return <button use:dragSensor={{ data: { index }, onDragStart: handleStart }} />;
 * ```
 *
 * The directive receives an accessor for its options, so this implementation
 * proxies option reads and callbacks to the latest accessor value. That makes
 * changing `data`, `disabled`, or callbacks over time behave as expected without
 * rebinding the native listener.
 */
export function createDragSensorDirective(scope: DragSensorFactory = createDragSensorFactory()) {
  return function dragSensor<TData = unknown, TElement extends HTMLElement = HTMLElement>(
    element: TElement,
    options: Accessor<CreateDragSensorOptions<TData, TElement>>
  ): DragSensorHandle<TData, TElement> {
    const sensor = scope.createSensor<TData, TElement>(createOptionsProxy(options));

    element.addEventListener('pointerdown', sensor.onPointerDown);
    onCleanup(() => {
      element.removeEventListener('pointerdown', sensor.onPointerDown);
    });

    return sensor;
  };
}

/**
 * Creates an option object whose fields delegate to the current directive value.
 *
 * `scope.createSensor()` snapshots the options object once, so plain values
 * would go stale if the directive expression changes. Getters and callback
 * wrappers preserve live reads.
 */
function createOptionsProxy<TData, TElement extends HTMLElement>(
  options: Accessor<CreateDragSensorOptions<TData, TElement>>
): CreateDragSensorOptions<TData, TElement> {
  return {
    get data() {
      return options().data;
    },
    get threshold() {
      return options().threshold;
    },
    get proxyCapture() {
      return options().proxyCapture;
    },
    get disabled() {
      return options().disabled;
    },
    onClick: (event, source) => options().onClick?.(event, source),
    onDragStart: (event) => options().onDragStart?.(event),
    onDragMove: (event) => options().onDragMove?.(event),
    onDragEnd: (event) => options().onDragEnd?.(event),
    onDragCancel: (event) => options().onDragCancel?.(event)
  };
}
