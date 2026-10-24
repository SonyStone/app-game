import { createEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import type { NativeHover, NativeShellClient } from './shellClient';

/**
 * Replays the pen hover the Android shell forwards as the page's own pen pointer events, for as long as Chromium does
 * not report it: after a covering window around a pen contact (the file chooser, the notification shade, rotation)
 * a WebView stops sending pen `pointermove`s without buttons, while Android keeps delivering hover to the shell.
 *
 * Each sample becomes what Chrome dispatches for a hovering pen at that point: `pointerover`/`pointerenter` and
 * `pointerout`/`pointerleave` as the element under it changes, a `pointermove` without buttons, and on `exit`
 * `pointerout` without a related target and `pointerleave` up to the document element. So every hover consumer
 * (`createPenHover`, `createPalmRejection`, the brush cursor) works unchanged. The events are untrusted and carry no
 * pressure; their `pointerId` is the pen's last one seen touching down.
 *
 * While the page itself receives pen hover (a hover event within `domHoverFreshMs`), the shell's samples are dropped,
 * so nothing is reported twice. Must be created within a Solid owner.
 */
export function createNativeHover(client: Pick<NativeShellClient, 'on'>) {
  /** When the page last received a real pen hover event. */
  let domHoverAt = -Infinity;
  /** The element the replayed pen hovers over, while it does. */
  let hovered: Element | undefined;
  let pointerId = defaultPointerId;
  const listenerOptions = { capture: true, passive: true };

  createEventListener(
    window,
    ['pointerover', 'pointermove'],
    (event) => {
      if (event.isTrusted && event.pointerType === 'pen' && event.buttons === 0) {
        domHoverAt = performance.now();
      }
    },
    listenerOptions
  );
  // A touch-down ends hover: the pen's own events take over until it lifts and the shell reports hover again.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.isTrusted && event.pointerType === 'pen') {
        pointerId = event.pointerId;
        hovered = undefined;
      }
    },
    listenerOptions
  );
  onCleanup(client.on('hover', replay));

  function replay(sample: NativeHover) {
    if (performance.now() - domHoverAt < domHoverFreshMs) {
      hovered = undefined;
      return;
    }

    const init = pointerInit(sample, pointerId);
    if (sample.phase === 'exit') {
      if (hovered) {
        moveBetween(hovered, undefined, init);
        hovered = undefined;
      }

      return;
    }

    const target = document.elementFromPoint(sample.x, sample.y) ?? document.documentElement;
    if (target !== hovered) {
      moveBetween(hovered, target, init);
      hovered = target;
    }

    target.dispatchEvent(new PointerEvent('pointermove', { ...init, bubbles: true, cancelable: true }));
  }
}

/** How recent the page's own pen hover must be for it to count as still reporting hover. */
const domHoverFreshMs = 150;

/** The `pointerId` before the pen first touched down: far from the small ids Chrome gives touches and the mouse. */
const defaultPointerId = 0x7fff0001;

/**
 * Dispatches what Chrome sends when a pointer moves from `from` to `to` (either may be absent): `pointerout` and
 * `pointerleave` for the elements left, then `pointerover` and `pointerenter` for those entered, outermost first.
 */
function moveBetween(from: Element | undefined, to: Element | undefined, init: PointerEventInit) {
  const left = ancestry(from);
  const entered = ancestry(to);
  if (from) {
    from.dispatchEvent(
      new PointerEvent('pointerout', { ...init, bubbles: true, cancelable: true, relatedTarget: to ?? null })
    );
    for (const element of left.filter((element) => !entered.includes(element))) {
      element.dispatchEvent(new PointerEvent('pointerleave', { ...init, relatedTarget: to ?? null }));
    }
  }

  if (to) {
    to.dispatchEvent(
      new PointerEvent('pointerover', { ...init, bubbles: true, cancelable: true, relatedTarget: from ?? null })
    );
    for (const element of entered.filter((element) => !left.includes(element)).reverse()) {
      element.dispatchEvent(new PointerEvent('pointerenter', { ...init, relatedTarget: from ?? null }));
    }
  }
}

/** `element` and its ancestors up to the document element, innermost first. */
function ancestry(element: Element | undefined) {
  const chain: Element[] = [];
  for (let current = element ?? null; current; current = current.parentElement) {
    chain.push(current);
  }

  return chain;
}

/** The pointer event fields of a hovering pen at `sample`. */
function pointerInit(sample: NativeHover, pointerId: number): PointerEventInit {
  const { tiltX, tiltY } = tiltFromAndroid(sample.tilt, sample.orientation);
  return {
    pointerId,
    pointerType: 'pen',
    isPrimary: true,
    composed: true,
    clientX: sample.x,
    clientY: sample.y,
    screenX: sample.x,
    screenY: sample.y,
    button: -1,
    buttons: 0,
    pressure: 0,
    width: 1,
    height: 1,
    tiltX,
    tiltY
  };
}

/**
 * Android's pen tilt (radians from the normal) and orientation (radians, 0 pointing up, -π/2 right) as the pointer
 * event's `tiltX`/`tiltY` in whole degrees, the way Chromium converts them for its own pen events.
 */
export function tiltFromAndroid(tilt: number, orientation: number) {
  const r = Math.sin(tilt);
  const z = Math.cos(tilt);
  return {
    tiltX: degrees(Math.atan2(Math.sin(-orientation) * r, z)),
    tiltY: degrees(Math.atan2(Math.cos(-orientation) * r, z))
  };
}

/** Whole degrees, without a negative zero. */
function degrees(radians: number) {
  return Math.round((radians * 180) / Math.PI) || 0;
}
