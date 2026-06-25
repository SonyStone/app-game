import { createEventListener } from '@solid-primitives/event-listener';
import { resolveFirst } from '@solid-primitives/refs';
import { access, isClient, type MaybeAccessor } from '@solid-primitives/utils';
import {
  type Accessor,
  children as resolveChildren,
  createContext,
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  useContext
} from 'solid-js';
import { type Vec2, of as vec2 } from '../core/vec2';
import { createCapture } from './createCapture';

// ============================================================================
// MARK: Types
// ============================================================================

export type DragPointerType = 'mouse' | 'touch' | 'pen';

export type DragSource<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** The element that received pointerdown and owns the drag intent. */
  element: TElement;
  /** The deepest event target from the original pointerdown. */
  target: EventTarget | null;
  /** Caller-provided data for distinguishing a target sensor. */
  data: TData;
};

export type DragStartEvent<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** Pointer position when the threshold was exceeded. */
  position: Vec2;
  /** Pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The source target that started this drag session. */
  source: DragSource<TData, TElement>;
  /** The original PointerEvent that started the drag. */
  pointerEvent: PointerEvent;
  /** @deprecated Use `source.target` instead. */
  target: PointerEvent['target'];
};

export type DragMoveEvent<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** Current pointer position. */
  position: Vec2;
  /** Delta from the initial pointerdown position (origin). */
  delta: Vec2;
  /** Pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The source target that started this drag session. */
  source: DragSource<TData, TElement>;
  /** The PointerEvent that produced this move. */
  pointerEvent: PointerEvent;
};

export type DragEndEvent<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** Final pointer position. */
  position: Vec2;
  /** Total delta from the initial pointerdown position (origin). */
  delta: Vec2;
  /** Pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The source target that started this drag session. */
  source: DragSource<TData, TElement>;
  /** The PointerEvent that ended this drag. */
  pointerEvent: PointerEvent;
};

export type DragCancelEvent<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  reason: 'escape' | 'lostcapture' | 'manual' | 'pointercancel';
  /** The source target that started this drag session. */
  source: DragSource<TData, TElement>;
  /** Pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The PointerEvent that cancelled this drag, when cancellation came from the pointer stream. */
  pointerEvent?: PointerEvent;
};

export type DragSensorCallbacks<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** Called when drag starts (threshold exceeded). */
  onDragStart?: (event: DragStartEvent<TData, TElement>) => void;
  /** Called on every pointer move during an active drag. */
  onDragMove?: (event: DragMoveEvent<TData, TElement>) => void;
  /** Called when the pointer is released during an active drag. */
  onDragEnd?: (event: DragEndEvent<TData, TElement>) => void;
  /** Called when the drag is cancelled after it started. */
  onDragCancel?: (event: DragCancelEvent<TData, TElement>) => void;
  /** Called when the pointer is released without exceeding the drag threshold. */
  onClick?: (event: PointerEvent, source: DragSource<TData, TElement>) => void;
};

export type DragSensorFactoryOptions = {
  /**
   * Pixels the pointer must travel (Euclidean) before a drag is detected.
   * This prevents accidental drags on click.
   * @default 8
   */
  threshold?: MaybeAccessor<number>;
  /**
   * Use a hidden proxy element for pointer capture instead of the source element.
   *
   * This lets the source element be removed during drag without losing capture.
   *
   * @default false
   */
  proxyCapture?: MaybeAccessor<boolean>;
};

export type CreateDragSensorOptions<TData = unknown, TElement extends HTMLElement = HTMLElement> = DragSensorCallbacks<
  TData,
  TElement
> & {
  /** Stable identity/data for this one target sensor. Snapshotted on pointerdown. */
  data?: MaybeAccessor<TData>;
  /** Optional target-level threshold override. */
  threshold?: MaybeAccessor<number>;
  /** Optional target-level proxy-capture override. */
  proxyCapture?: MaybeAccessor<boolean>;
  /** Optional target-level disabled gate. */
  disabled?: MaybeAccessor<boolean>;
};

/** Backward-compatible option name for the old one-call primitive. */
export type DragSensorOptions<TData = unknown, TElement extends HTMLElement = HTMLElement> = CreateDragSensorOptions<
  TData,
  TElement
> &
  DragSensorFactoryOptions;

export type DragSensorHandle<TData = unknown, TElement extends HTMLElement = HTMLElement> = {
  /** Whether this target sensor owns the active drag. */
  isDragging: Accessor<boolean>;
  /** Whether this target sensor is tracking pointerdown or dragging. */
  isActive: Accessor<boolean>;
  /** Current pointer position during this target's drag, or null when idle. */
  position: Accessor<Vec2 | null>;
  /** Delta from the initial pointerdown position (origin), or null when idle. */
  delta: Accessor<Vec2 | null>;
  /** Pointer type of the active/last factory session. */
  pointerType: Accessor<DragPointerType>;
  /** Pointer id for the active factory session, or null when idle. */
  activePointerId: Accessor<number | null>;
  /** Source element/data for this target's active session, or null when idle. */
  source: Accessor<DragSource<TData, TElement> | null>;
  /** Bind this to `onPointerDown` on this target element. */
  onPointerDown: (event: PointerEvent) => void;
  /** Programmatically cancel this target's current drag, if it owns one. */
  cancel: VoidFunction;
};

export type DragSensorFactory = {
  <TData = unknown, TElement extends HTMLElement = HTMLElement>(
    options?: CreateDragSensorOptions<TData, TElement>
  ): DragSensorHandle<TData, TElement>;
  createSensor: <TData = unknown, TElement extends HTMLElement = HTMLElement>(
    options?: CreateDragSensorOptions<TData, TElement>
  ) => DragSensorHandle<TData, TElement>;
  /** Whether any target sensor from this factory is currently dragging. */
  isDragging: Accessor<boolean>;
  /** Whether any target sensor from this factory is tracking pointerdown or dragging. */
  isActive: Accessor<boolean>;
  /** Current pointer position for the active factory session, or null when idle. */
  position: Accessor<Vec2 | null>;
  /** Current delta for the active factory session, or null when idle. */
  delta: Accessor<Vec2 | null>;
  /** Pointer type of the current/last session. */
  pointerType: Accessor<DragPointerType>;
  /** Pointer id for the active session, or null when idle. */
  activePointerId: Accessor<number | null>;
  /** Source element/data for the active factory session, or null when idle. */
  activeSource: Accessor<DragSource<unknown, HTMLElement> | null>;
  /** Programmatically cancel the active drag, if there is one. */
  cancel: VoidFunction;
};

export type DragSensorProps<TData = unknown, TElement extends HTMLElement = HTMLElement> = CreateDragSensorOptions<
  TData,
  TElement
> & {
  /** Shared coordinator. Usually provided by `<DragSensor.Scope>`. */
  factory?: DragSensorFactory;
  children?: JSX.Element;
};

export type DragSensorScopeProps = DragSensorFactoryOptions & {
  children?: JSX.Element | ((scope: DragSensorFactory) => JSX.Element);
};

export type DragSensorComponent = {
  <TData = unknown, TElement extends HTMLElement = HTMLElement>(props: DragSensorProps<TData, TElement>): JSX.Element;
  Scope: (props: DragSensorScopeProps) => JSX.Element;
};

type TargetSensorState<TData, TElement extends HTMLElement> = {
  id: symbol;
  options: CreateDragSensorOptions<TData, TElement>;
  isDragging: Accessor<boolean>;
  setIsDragging: (value: boolean) => void;
  isActive: Accessor<boolean>;
  setIsActive: (value: boolean) => void;
  position: Accessor<Vec2 | null>;
  setPosition: (value: Vec2 | null) => void;
  delta: Accessor<Vec2 | null>;
  setDelta: (value: Vec2 | null) => void;
  source: Accessor<DragSource<TData, TElement> | null>;
  setSource: (value: DragSource<TData, TElement> | null) => void;
};

type DragSession<TData, TElement extends HTMLElement> = {
  phase: 'dragging' | 'tracking';
  pointerId: number;
  origin: Vec2;
  source: DragSource<TData, TElement>;
  startPointerEvent: PointerEvent;
  sensor: TargetSensorState<TData, TElement>;
};

const DragSensorContext = createContext<DragSensorFactory>();

// ============================================================================
// MARK: createDragSensorFactory
// ============================================================================

/**
 * Creates a drag coordinator and returns a function for creating one-target sensors.
 *
 * The factory owns the single active pointer/capture session. Each returned sensor
 * owns one target's identity and callbacks.
 */
export function createDragSensorFactory(factoryOptions: DragSensorFactoryOptions = {}): DragSensorFactory {
  const [isDragging, setIsDragging] = createSignal(false);
  const [isActive, setIsActive] = createSignal(false);
  const [position, setPosition] = createSignal<Vec2 | null>(null);
  const [delta, setDelta] = createSignal<Vec2 | null>(null);
  const [pointerType, setPointerType] = createSignal<DragPointerType>('mouse');
  const [activePointerId, setActivePointerId] = createSignal<number | null>(null);
  const [activeSource, setActiveSource] = createSignal<DragSource<unknown, HTMLElement> | null>(null);

  let session: DragSession<unknown, HTMLElement> | null = null;

  const capture = createCapture({
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostCapture
  });

  createEscapeKeyHandler({ cancel, isActive });
  onCleanup(resetState);

  function createSensor<TData = unknown, TElement extends HTMLElement = HTMLElement>(
    options: CreateDragSensorOptions<TData, TElement> = {}
  ): DragSensorHandle<TData, TElement> {
    const [targetIsDragging, setTargetIsDragging] = createSignal(false);
    const [targetIsActive, setTargetIsActive] = createSignal(false);
    const [targetPosition, setTargetPosition] = createSignal<Vec2 | null>(null);
    const [targetDelta, setTargetDelta] = createSignal<Vec2 | null>(null);
    const [targetSource, setTargetSource] = createSignal<DragSource<TData, TElement> | null>(null);

    const sensor: TargetSensorState<TData, TElement> = {
      id: Symbol('drag-sensor-target'),
      options,
      isDragging: targetIsDragging,
      setIsDragging: setTargetIsDragging,
      isActive: targetIsActive,
      setIsActive: setTargetIsActive,
      position: targetPosition,
      setPosition: setTargetPosition,
      delta: targetDelta,
      setDelta: setTargetDelta,
      source: targetSource,
      setSource: setTargetSource
    };

    function onPointerDown(event: PointerEvent): void {
      if (access(options.disabled)) {
        return;
      }

      if (!isPrimaryPointer(event) || session) {
        return;
      }

      if (!isPointerCaptureElement(event.currentTarget)) {
        return;
      }

      const element = event.currentTarget as TElement;
      const source: DragSource<TData, TElement> = {
        element,
        target: event.target,
        data: access(options.data) as TData
      };

      capture.set(element, event.pointerId);

      session = {
        phase: 'tracking',
        pointerId: event.pointerId,
        origin: vec2(event.clientX, event.clientY),
        source: source as DragSource<unknown, HTMLElement>,
        startPointerEvent: event,
        sensor: sensor as unknown as TargetSensorState<unknown, HTMLElement>
      };

      setActivePointerId(event.pointerId);
      setActiveSource(source as DragSource<unknown, HTMLElement>);
      setPointerType(toPointerType(event.pointerType));
      setIsActive(true);

      sensor.setIsActive(true);
      sensor.setSource(source);
    }

    function cancel(): void {
      if (session?.sensor.id !== sensor.id) {
        return;
      }

      cancelSession('manual');
      resetState();
    }

    return {
      isDragging: targetIsDragging,
      isActive: targetIsActive,
      position: targetPosition,
      delta: targetDelta,
      pointerType,
      activePointerId,
      source: targetSource,
      onPointerDown,
      cancel
    };
  }

  function onPointerMove(event: PointerEvent): void {
    const current = session;
    if (!isActivePointer(current, event)) {
      return;
    }

    const pos = vec2(event.clientX, event.clientY);
    const nextDelta = vec2(pos.x - current.origin.x, pos.y - current.origin.y);

    if (current.phase === 'tracking') {
      const threshold = resolveThreshold(current.sensor.options);
      const distSq = nextDelta.x * nextDelta.x + nextDelta.y * nextDelta.y;

      if (distSq < threshold * threshold) {
        return;
      }

      current.phase = 'dragging';
      event.preventDefault();

      if (resolveProxyCapture(current.sensor.options)) {
        capture.transferToProxy();
      }

      setDragState(current, pos, nextDelta);
      current.sensor.options.onDragStart?.({
        position: pos,
        origin: current.origin,
        source: current.source,
        pointerEvent: current.startPointerEvent,
        target: current.source.target
      });
      return;
    }

    setMoveState(current, pos, nextDelta);
    current.sensor.options.onDragMove?.({
      position: pos,
      delta: nextDelta,
      origin: current.origin,
      source: current.source,
      pointerEvent: event
    });
  }

  function onPointerUp(event: PointerEvent): void {
    const current = session;
    if (!isActivePointer(current, event)) {
      return;
    }

    const pos = vec2(event.clientX, event.clientY);
    const nextDelta = vec2(pos.x - current.origin.x, pos.y - current.origin.y);

    if (current.phase === 'dragging') {
      current.sensor.options.onDragEnd?.({
        position: pos,
        delta: nextDelta,
        origin: current.origin,
        source: current.source,
        pointerEvent: event
      });
    } else {
      current.sensor.options.onClick?.(event, current.source);
    }

    resetState();
  }

  function onPointerCancel(event: PointerEvent): void {
    const current = session;
    if (!isActivePointer(current, event)) {
      return;
    }

    cancelSession('pointercancel', event);
    resetState();
  }

  function onLostCapture(event: PointerEvent): void {
    const current = session;
    if (!isActivePointer(current, event)) {
      return;
    }

    cancelSession('lostcapture', event);
    resetState();
  }

  function cancel(): void {
    cancelSession('manual');
    resetState();
  }

  function setDragState(current: DragSession<unknown, HTMLElement>, nextPosition: Vec2, nextDelta: Vec2): void {
    setIsDragging(true);
    current.sensor.setIsDragging(true);
    setMoveState(current, nextPosition, nextDelta);
  }

  function setMoveState(current: DragSession<unknown, HTMLElement>, nextPosition: Vec2, nextDelta: Vec2): void {
    setPosition(nextPosition);
    setDelta(nextDelta);
    current.sensor.setPosition(nextPosition);
    current.sensor.setDelta(nextDelta);
  }

  function cancelSession(reason: DragCancelEvent['reason'], pointerEvent?: PointerEvent): void {
    const current = session;
    if (current?.phase !== 'dragging') {
      return;
    }

    current.sensor.options.onDragCancel?.({
      reason,
      source: current.source,
      origin: current.origin,
      pointerEvent
    });
  }

  function resetState(): void {
    const current = session;
    session = null;
    capture.release();

    setIsDragging(false);
    setIsActive(false);
    setPosition(null);
    setDelta(null);
    setActivePointerId(null);
    setActiveSource(null);

    if (!current) {
      return;
    }

    current.sensor.setIsDragging(false);
    current.sensor.setIsActive(false);
    current.sensor.setPosition(null);
    current.sensor.setDelta(null);
    current.sensor.setSource(null);
  }

  function resolveThreshold(options: CreateDragSensorOptions<unknown, HTMLElement>): number {
    return access(options.threshold) ?? access(factoryOptions.threshold) ?? 8;
  }

  function resolveProxyCapture(options: CreateDragSensorOptions<unknown, HTMLElement>): boolean {
    return access(options.proxyCapture) ?? access(factoryOptions.proxyCapture) ?? false;
  }

  const factory = Object.assign(createSensor, {
    createSensor,
    isDragging,
    isActive,
    position,
    delta,
    pointerType,
    activePointerId,
    activeSource,
    cancel
  }) satisfies DragSensorFactory;

  return factory;
}

// ============================================================================
// MARK: createDragSensor
// ============================================================================

/**
 * Backward-compatible single-target helper.
 *
 * Prefer `createDragSensorFactory()` when several draggable targets should share
 * one active drag coordinator.
 */
export function createDragSensor<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  options: DragSensorOptions<TData, TElement> = {}
): DragSensorHandle<TData, TElement> {
  const factory = createDragSensorFactory({
    threshold: options.threshold,
    proxyCapture: options.proxyCapture
  });

  return factory.createSensor(options);
}

// ============================================================================
// MARK: DragSensor
// ============================================================================

/**
 * JSX wrapper for attaching a one-target drag sensor to the first resolved child
 * HTMLElement without changing the rendered DOM shape.
 */
function DragSensorTarget<TData = unknown, TElement extends HTMLElement = HTMLElement>(
  props: DragSensorProps<TData, TElement>
): JSX.Element {
  const factory = props.factory ?? useContext(DragSensorContext) ?? createDragSensorFactory();
  const sensor = factory.createSensor<TData, TElement>(props);
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

    target.addEventListener('pointerdown', sensor.onPointerDown);
    onCleanup(() => {
      target.removeEventListener('pointerdown', sensor.onPointerDown);
    });
  });

  return resolved();
}

function DragSensorScope(props: DragSensorScopeProps): JSX.Element {
  const scope = createDragSensorFactory(props);
  const child = props.children;

  return (
    <DragSensorContext.Provider value={scope}>
      {typeof child === 'function' ? child(scope) : child}
    </DragSensorContext.Provider>
  );
}

export const DragSensor = Object.assign(DragSensorTarget, {
  Scope: DragSensorScope
}) satisfies DragSensorComponent;

/** Only true if primary pointer (left mouse / first finger). */
function isPrimaryPointer(event: Pick<PointerEvent, 'isPrimary' | 'button'>): boolean {
  return event.isPrimary && event.button === 0;
}

function isActivePointer(
  session: DragSession<unknown, HTMLElement> | null,
  event: Pick<PointerEvent, 'isPrimary' | 'pointerId'>
): session is DragSession<unknown, HTMLElement> {
  return session !== null && event.isPrimary && event.pointerId === session.pointerId;
}

function isPointerCaptureElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement;
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return isClient && value instanceof HTMLElement;
}

function toPointerType(pointerType: string): DragPointerType {
  if (pointerType === 'touch' || pointerType === 'pen') {
    return pointerType;
  }

  return 'mouse';
}

// Only registered when tracking or dragging to avoid firing on every keydown.
function createEscapeKeyHandler(props: { cancel(): void; isActive: Accessor<boolean> }) {
  if (isClient) {
    createEventListener(document, 'keydown', (event) => {
      if (props.isActive() && event.key === 'Escape') {
        props.cancel();
      }
    });
  }
}
