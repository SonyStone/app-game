import { createSignal, onCleanup } from 'solid-js';

/**
 * Which control's hint shows, for `HintCard`s: a pen or mouse resting 400 ms on a control shows its hint, moving on to
 * the next control within a moment shows that one at once, and leaving or pressing hides it. Touch shows none.
 * `on(id)` returns a control's pointer handlers; spread them where the control is created, they keep no per-control
 * state. Must be created within a Solid owner.
 */
export function createHoverHints<Id extends string>() {
  const [shown, setShown] = createSignal<{ id: Id; element: HTMLElement }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the last hint hid, so that the next control's shows without waiting. */
  let hidden = -Infinity;
  const hide = () => {
    clearTimeout(timer);
    if (shown()) {
      hidden = performance.now();
      setShown(undefined);
    }
  };
  onCleanup(() => clearTimeout(timer));

  return {
    /** The control whose hint shows, and its element for placing the card. */
    shown,
    hide,
    on(id: Id) {
      return {
        onPointerEnter(event: PointerEvent & { currentTarget: HTMLElement }) {
          if (event.pointerType === 'touch') {
            return;
          }

          const element = event.currentTarget;
          clearTimeout(timer);
          timer = setTimeout(() => setShown({ id, element }), performance.now() - hidden < 300 ? 0 : 400);
        },
        onPointerLeave: hide,
        onPointerDown: hide
      };
    }
  };
}
