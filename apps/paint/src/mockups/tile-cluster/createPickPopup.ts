import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal } from 'solid-js';
import { useClusterActions } from './clusterActions';

/**
 * The press-and-slide gesture of a button that opens a popup of choices right under the pointer, with the current
 * choice where the press is: slide onto another choice and lift; or tap, then tap or slide in the popup. A press
 * elsewhere or Escape closes the popup without a pick. While a press is in progress the cluster hides behind the
 * popup, and it comes back under the pointer where the press ends. Must be created within a component under a
 * `ClusterActions` provider.
 */
export function createPickPopup<T>(options: {
  /** Where the popup goes for a press at `point`. */
  place: (point: { x: number; y: number }) => PopupRect;
  /** The choice under `(x, y)`, in viewport pixels, if any. */
  hit: (popup: PopupRect, x: number, y: number) => T | undefined;
  /** Receives each choice pointed at, and `undefined` when the popup closes without a pick. */
  onPreview: (choice: T | undefined) => void;
  onPick: (choice: T) => void;
}) {
  const actions = useClusterActions();
  const [popup, setPopup] = createSignal<PopupRect>();
  const [hover, setHover] = createSignal<T>();
  let button: HTMLElement | undefined;
  let popupElement: HTMLElement | undefined;
  /** How the open popup is used: by a press in progress, or waiting for taps. */
  let mode: 'press' | 'tap' | undefined;
  let press: { id: number; x: number; y: number; moved: boolean; fromButton: boolean } | undefined;

  const point = (x: number, y: number) => {
    const open = popup();
    const choice = open && options.hit(open, x, y);
    setHover(() => choice);
    options.onPreview(choice);
    return choice;
  };
  /** Closes the popup; a press that ends at `at` brings the cluster back there. */
  const close = (picked: T | undefined, at?: { x: number; y: number }) => {
    const pressing = mode === 'press';
    mode = undefined;
    press = undefined;
    setPopup(undefined);
    setHover(undefined);
    if (picked === undefined) {
      options.onPreview(undefined);
    } else {
      options.onPick(picked);
    }

    if (pressing) {
      actions.end(at);
    }
  };
  const startPress = (event: PointerEvent, fromButton: boolean) => {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    mode = 'press';
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, fromButton };
    actions.begin(button);
    // The button's press starts on the current choice, which needs no preview.
    if (!fromButton) {
      point(event.clientX, event.clientY);
    }
  };
  const move = (event: PointerEvent) => {
    if (press?.id === event.pointerId) {
      press.moved ||= Math.hypot(event.clientX - press.x, event.clientY - press.y) >= tapDistance;
      point(event.clientX, event.clientY);
    }
  };
  const release = (event: PointerEvent) => {
    if (press?.id !== event.pointerId) {
      return;
    }

    const at = { x: event.clientX, y: event.clientY };
    const picked = point(at.x, at.y);
    if (press.fromButton && !press.moved) {
      // A tap keeps the popup open for tapping or sliding in it; the cluster shows again meanwhile.
      mode = 'tap';
      press = undefined;
      setHover(undefined);
      options.onPreview(undefined);
      actions.end(at);
    } else {
      close(picked, at);
    }
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const target = event.target as Node;
      if (mode === 'tap' && !button?.contains(target) && !popupElement?.contains(target)) {
        close(undefined);
      }
    },
    { capture: true }
  );
  createEventListener(window, 'keydown', (event) => {
    if (popup() && event.key === 'Escape') {
      event.stopPropagation();
      close(undefined);
    }
  });

  return {
    /** The open popup's placement. */
    popup,
    /** The choice the pointer is on. */
    hover,
    bindButton(element: HTMLElement) {
      button = element;
    },
    bindPopup(element: HTMLElement) {
      popupElement = element;
    },
    /** Handlers for the button. */
    buttonEvents: {
      onPointerDown(event: PointerEvent) {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        if (mode === 'tap') {
          event.preventDefault();
          close(undefined);
          return;
        }

        setPopup(options.place({ x: event.clientX, y: event.clientY }));
        startPress(event, true);
      },
      onPointerMove: move,
      onPointerUp: release,
      onPointerCancel: () => close(undefined)
    },
    /** Handlers for the popup, which starts a press of its own while it waits for taps. */
    popupEvents: {
      onPointerDown(event: PointerEvent) {
        if (mode === 'tap') {
          startPress(event, false);
        }
      },
      onPointerMove: move,
      onPointerUp: release,
      onPointerCancel: () => close(undefined)
    }
  };
}

/** A popup's placement in viewport pixels. */
export type PopupRect = { left: number; top: number; width: number; height: number };

/**
 * Places a popup of `width` × `height` so that its own point `anchor` lies at `point`, the press, kept inside the
 * viewport.
 */
export function placeAt(
  point: { x: number; y: number },
  width: number,
  height: number,
  anchor: { x: number; y: number }
): PopupRect {
  return {
    left: clamp(point.x - anchor.x, margin, innerWidth - width - margin),
    top: clamp(point.y - anchor.y, margin, innerHeight - height - margin),
    width,
    height
  };
}

const margin = 8;
/** CSS pixels a pen or finger may move during a tap. */
const tapDistance = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
