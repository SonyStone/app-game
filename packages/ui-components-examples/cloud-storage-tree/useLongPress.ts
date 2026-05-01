import { onCleanup } from 'solid-js';

// ============================================================================
// MARK: Types
// ============================================================================

export type LongPressOptions = {
  onLongPress: (e: PointerEvent) => void;
  onPress?: (e: PointerEvent) => void;
  delay?: number;
};

export type LongPressHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
};

// ============================================================================
// MARK: Hook
// ============================================================================

/**
 * Creates handlers for detecting long press (for mobile context menu)
 */
export function createLongPressHandlers(options: LongPressOptions): LongPressHandlers {
  const delay = options.delay ?? 500;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;
  let startEvent: PointerEvent | null = null;

  const clear = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  onCleanup(clear);

  return {
    onPointerDown(e: PointerEvent) {
      // Only handle touch/pen, not mouse (mouse has right-click)
      if (e.pointerType === 'mouse') return;

      isLongPress = false;
      startEvent = e;

      clear();
      timeoutId = setTimeout(() => {
        isLongPress = true;
        if (startEvent) {
          options.onLongPress(startEvent);
        }
      }, delay);
    },

    onPointerUp(e: PointerEvent) {
      if (e.pointerType === 'mouse') return;

      clear();

      // If it wasn't a long press, trigger normal press
      if (!isLongPress && options.onPress && startEvent) {
        options.onPress(startEvent);
      }

      startEvent = null;
    },

    onPointerLeave() {
      clear();
      startEvent = null;
    },

    onPointerCancel() {
      clear();
      startEvent = null;
    }
  };
}

/**
 * Check if the current device supports touch
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
