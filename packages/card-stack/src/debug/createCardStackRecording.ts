import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, untrack, type Accessor } from 'solid-js';
import { createMotionRecorder } from './createMotionRecorder';

/** Reads only structural deck elements; records no panel text, inputs or application content. */
export function createCardStackRecording(target: Accessor<HTMLElement | undefined>) {
  const identities = new WeakMap<Element, number>();
  let sequence = 0;
  let pointer: { id: number; x: number; y: number } | undefined;
  const gestures = new Map<number, number>();
  let gestureSequence = 0;
  let recordingRoot: HTMLElement | undefined;
  const recorder = createMotionRecorder<NonNullable<ReturnType<typeof readFrame>>, StackEvent>(readFrame);
  const listeningTarget = () => recorder.status() === 'recording' ? target() : undefined;

  createEventListener(
    () => listeningTarget()?.ownerDocument,
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture'],
    (event) => {
      const root = listeningTarget();
      if (!root) return;
      if (event.type === 'pointerdown') {
        if (!(event.target instanceof Element) || event.target.closest('[data-tabs-root]') !== root) return;
        gestures.set(event.pointerId, ++gestureSequence);
      }
      const gesture = gestures.get(event.pointerId);
      if (gesture === undefined) return;
      if (event.isPrimary) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      const bounds = root.getBoundingClientRect();
      // Touch starts with implicit capture on the tab; dragging transfers it to the root.
      const captureTransfer = event.type === 'lostpointercapture' && root.hasPointerCapture(event.pointerId);
      const receiver = describeTarget(root, event.target);
      const hit = root.ownerDocument.elementFromPoint?.(event.clientX, event.clientY);
      recorder.mark({
        type: event.type,
        pointer: {
          id: event.pointerId, gesture, x: event.clientX, y: event.clientY,
          rootX: event.clientX - bounds.left, rootY: event.clientY - bounds.top,
          pointerType: event.pointerType, button: event.button, buttons: event.buttons,
          pressure: event.pressure, isPrimary: event.isPrimary
        },
        receiver, hit: hit === undefined ? { label: 'Unavailable' } : describeTarget(root, hit),
        ...eventContext(root, event.target),
        ...(event.type === 'lostpointercapture' ? { captureTransfer } : {})
      });
      if (event.type === 'pointerup' || event.type === 'pointercancel' || (event.type === 'lostpointercapture' && !captureTransfer)) {
        gestures.delete(event.pointerId);
        if (pointer?.id === event.pointerId) pointer = undefined;
      }
    },
    { capture: true, passive: true }
  );
  createEventListener(
    listeningTarget,
    ['click', 'animationstart', 'animationend', 'animationcancel'],
    (event) => {
      const root = listeningTarget();
      if (!root || !(event.target instanceof Element) || event.target.closest('[data-tabs-root]') !== root) return;
      // Ignore animations inside user content and echoed snapshots.
      if (event.type !== 'click' && !event.target.matches('[data-tabs-card], [data-tabs-trigger]')) return;
      recorder.mark({
        type: event.type,
        ...eventContext(root, event.target),
        ...('animationName' in event ? { animation: String(event.animationName) } : {})
      });
    },
    { capture: true, passive: true }
  );
  createEventListener(() => recorder.status() === 'recording' || recorder.status() === 'scheduled' ? target()?.ownerDocument : undefined, 'visibilitychange', () => {
    if (target()?.ownerDocument.hidden) recorder.freeze('document-hidden');
  });
  createEffect(target, (root) => {
    if (root !== recordingRoot) untrack(() => recorder.freeze('target-changed'));
  });
  return {
    ...recorder,
    start(options?: Parameters<typeof recorder.start>[0]) {
      if (recorder.status() === 'recording' || recorder.status() === 'scheduled') return;
      recordingRoot = target();
      pointer = undefined;
      gestures.clear();
      recorder.start(options);
    }
  };

  /** Structural identity only: never stores text, values, selectors or user content. */
  function describeTarget(root: HTMLElement, target: EventTarget | null): { label: string; instance?: number } {
    if (target === root) return { label: 'Deck' };
    if (!(target instanceof Element) || target.closest('[data-tabs-root]') !== root) return { label: 'Outside deck' };
    const structural = target.closest<HTMLElement>('[data-tabs-trigger], [data-tabs-card]');
    if (!structural) return { label: target.tagName.toLowerCase() };
    if (!identities.has(structural)) identities.set(structural, ++sequence);
    const part = structural.hasAttribute('data-tabs-trigger') ? 'tab' : 'card';
    const item = structural.dataset.tabsTrigger ?? structural.dataset.tabsCard;
    const child = structural !== target ? ` / ${target.tagName.toLowerCase()}` : '';
    return { label: `${item} / ${part}${child}`, instance: identities.get(structural)! };
  }

  function readFrame() {
    const root = target();
    if (!root?.isConnected || root !== recordingRoot) return undefined;
    const bounds = root.getBoundingClientRect();
    const elements = [...root.querySelectorAll<HTMLElement>(':scope > [data-tabs-card]')].flatMap((card, domOrder) => {
      const tab = card.querySelector<HTMLElement>(':scope > [data-tabs-trigger]');
      const panel = card.querySelector<HTMLElement>(':scope > [data-tabs-panel]');
      const cardCss = getComputedStyle(card);
      const itemId = card.dataset.tabsCard!;
      const representation = card.hasAttribute('data-tabs-echo') ? 'echo' : 'live';
      return [measure(card, 'card'), ...(tab ? [measure(tab, 'tab')] : [])];

      function measure(element: HTMLElement, part: 'card' | 'tab') {
        if (!identities.has(element)) identities.set(element, ++sequence);
        const rect = element.getBoundingClientRect();
        const css = element === card ? cardCss : getComputedStyle(element);
        const surface = part === 'card' && panel ? panel : element;
        const surfaceRect = surface.getBoundingClientRect();
        const surfaceCss = surface === element ? css : getComputedStyle(surface);
        return {
          instance: identities.get(element)!, itemId, representation, part,
          x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height,
          transform: css.transform, opacity: css.opacity, visibility: css.visibility, zIndex: css.zIndex,
          // Cards form sibling stacking contexts. Their panels paint below their own tabs.
          paint: {
            cardZ: Number(cardCss.zIndex) || 0, domOrder,
            localZ: part === 'tab' ? Number(css.zIndex) || 0 : Number(surfaceCss.zIndex) || 0,
            opacity: Number(cardCss.opacity) * Number(surfaceCss.opacity),
            visibility: cardCss.visibility === 'hidden' || cardCss.visibility === 'collapse' ? cardCss.visibility : surfaceCss.visibility,
            x: surfaceRect.left - bounds.left, y: surfaceRect.top - bounds.top,
            width: surfaceRect.width, height: surfaceRect.height
          },
          phase: card.dataset.phase ?? 'idle', active: card.hasAttribute('data-active'),
          // Keep authored units; these are controller outputs, not resolved pixel targets.
          motionStyle: {
            offset: card.style.getPropertyValue('--offset'),
            paintedOffset: card.style.getPropertyValue('--painted-offset'),
            dragOffset: card.style.getPropertyValue('--card-drag-offset'),
            paintedLeft: tab?.style.getPropertyValue('--painted-left') ?? ''
          }
        };
      }
    });
    return {
      root: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      state: readState(root),
      pointer: pointer ? { ...pointer } : null,
      elements
    };
  }
}

/** Events describe capture-phase DOM state, before gesture handlers may update it. */
type StackEvent = {
  type: string;
  itemId?: string | undefined;
  representation?: string;
  animation?: string;
  /** True when implicit touch capture moved from a tab to the deck; the gesture continues. */
  captureTransfer?: boolean;
  /** Viewport and event-time deck-relative CSS pixels; gesture separates reused pointer IDs. */
  pointer?: {
    id: number; gesture: number; x: number; y: number; rootX: number; rootY: number;
    pointerType: string; button: number; buttons: number; pressure: number; isPrimary: boolean;
  };
  /** Dispatch target (possibly captured) and hit-tested element, observed before handlers. */
  receiver?: { label: string; instance?: number };
  hit?: { label: string; instance?: number };
  state: ReturnType<typeof readState>;
};

function eventContext(root: HTMLElement, target: EventTarget | null) {
  const card = target instanceof Element ? target.closest<HTMLElement>('[data-tabs-card]') : null;
  return {
    itemId: card?.dataset.tabsCard,
    representation: card?.hasAttribute('data-tabs-echo') ? 'echo' : 'live',
    state: readState(root)
  };
}

function readState(root: HTMLElement) {
  return {
    phase: root.dataset.motion ?? 'idle', layout: root.dataset.layout,
    dragging: root.hasAttribute('data-dragging'), direct: root.hasAttribute('data-direct'),
    selectionTarget: root.dataset.selectionTarget ?? null,
    tabOrder: root.dataset.tabOrder?.split(' ') ?? [],
    railOffset: Number(root.dataset.railOffset ?? 0),
    stackPan: Number(root.dataset.stackPan ?? 0)
  };
}
