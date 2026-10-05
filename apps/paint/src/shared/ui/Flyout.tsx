import { makeEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createUniqueId, onCleanup } from 'solid-js';
import styles from './Flyout.module.css';
import { SketchIcon, type SketchIconName } from './SketchIcon';

/**
 * A button of a `FloatingBar` that opens a small menu next to it, for choices and commands that need not stay in view,
 * such as the tool of a group or rarely used actions. `face` shows what the button stands for, such as the icon of the
 * current choice; a small corner mark tells it opens a menu.
 *
 * Made for a pen: the menu opens as soon as the button is pressed, and while the press goes on, dragging onto an item
 * and releasing chooses it, as in a marking menu; a press released on the button leaves the menu open for a tap, and
 * the next press on the button closes it. A hovering pen or mouse opens it after a moment and closes it again shortly after leaving both, unless a press opened
 * it. Enter or Space on the focused button toggles it. The menu is the browser's popover: it shows above everything,
 * below the button or above it where there is no room, and closes on a press outside, on Escape, and when `children`
 * call `close`, as a chosen item does.
 */
export function Flyout(props: {
  /** Accessible name of the button and of its menu. */
  label: string;
  title: string;
  face: JSX.Element;
  disabled?: boolean;
  /** The menu's content, such as `FlyoutItem`s; `close` hides the menu. */
  children: (close: () => void) => JSX.Element;
}) {
  const id = createUniqueId();
  let button!: HTMLButtonElement;
  let menu!: HTMLDivElement;
  /** How the open menu was opened: a hover closes it on leaving, a press does not. */
  let openedBy: 'hover' | 'press' | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Ends the press-drag in progress. */
  let endDrag: (() => void) | undefined;
  const wait = (delay: number, action: () => void) => {
    clearTimeout(timer);
    timer = setTimeout(action, delay);
  };
  const isOpen = () => menu.matches(':popover-open');
  const open = (by: 'hover' | 'press') => {
    clearTimeout(timer);
    if (by === 'press' || !isOpen()) {
      openedBy = by;
    }

    if (!isOpen()) {
      menu.showPopover();
    }
  };
  const close = () => {
    clearTimeout(timer);
    if (isOpen()) {
      menu.hidePopover();
    }
  };
  /** Places the menu below the button, centered on it, or above it when it does not fit below; inside the window. */
  const place = () => {
    const anchor = button.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const below = anchor.bottom + gap;
    const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, anchor.top - gap - height);
    const left = Math.min(
      window.innerWidth - margin - width,
      Math.max(margin, anchor.left + anchor.width / 2 - width / 2)
    );
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  };
  /** The enabled item under a client point, if any, among this menu's. */
  const itemAt = (x: number, y: number) => {
    const item = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('[role^="menuitem"]');
    return item && menu.contains(item) && !item.disabled ? item : undefined;
  };
  const highlight = (item: HTMLElement | undefined) => {
    for (const candidate of menu.querySelectorAll<HTMLElement>('[data-highlighted]')) {
      if (candidate !== item) {
        delete candidate.dataset.highlighted;
      }
    }

    if (item) {
      item.dataset.highlighted = 'true';
    }
  };
  /** Follows a press that opened the menu: an item it is released on is chosen. */
  const followPress = (pointerId: number) => {
    endDrag?.();
    const stops = [
      makeEventListener(window, 'pointermove', (event) => {
        if (event.pointerId === pointerId) {
          highlight(itemAt(event.clientX, event.clientY));
        }
      }),
      makeEventListener(window, 'pointerup', (event) => {
        if (event.pointerId !== pointerId) {
          return;
        }

        const item = itemAt(event.clientX, event.clientY);
        endDrag?.();
        item?.click();
      }),
      makeEventListener(window, 'pointercancel', (event) => {
        if (event.pointerId === pointerId) {
          endDrag?.();
        }
      })
    ];
    endDrag = () => {
      stops.forEach((stop) => stop());
      highlight(undefined);
      endDrag = undefined;
    };
  };
  onCleanup(() => {
    clearTimeout(timer);
    endDrag?.();
  });

  return (
    <>
      <button
        ref={button}
        class={styles.trigger}
        aria-label={props.label}
        title={props.title}
        aria-haspopup="menu"
        popovertarget={id}
        disabled={props.disabled}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
          }

          // A second press closes a menu that a press opened.
          if (isOpen() && openedBy === 'press') {
            close();
            return;
          }

          open('press');
          followPress(event.pointerId);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch' && event.buttons === 0 && !props.disabled) {
            wait(hoverOpenMs, () => open('hover'));
          }
        }}
        onPointerLeave={() => {
          if (openedBy === 'hover') {
            wait(hoverCloseMs, close);
          } else if (!isOpen()) {
            clearTimeout(timer);
          }
        }}
        onClick={(event) => {
          // Presses open the menu on their own; a click from Enter or Space (no pointer) toggles it as the button does.
          if (event.detail !== 0) {
            event.preventDefault();
          }
        }}
      >
        {props.face}
        <svg class={styles.mark} width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
          <path d="M6 0v6H0Z" />
        </svg>
      </button>
      <div
        ref={menu}
        id={id}
        popover
        class={styles.menu}
        role="menu"
        aria-label={props.label}
        onPointerEnter={() => {
          if (openedBy === 'hover') {
            clearTimeout(timer);
          }
        }}
        onPointerLeave={(event) => {
          if (openedBy === 'hover' && event.pointerType !== 'touch') {
            wait(hoverCloseMs, close);
          }
        }}
        // Before it shows, near the button; once it has a size, exactly.
        onBeforeToggle={(event) => {
          if (event.newState === 'open') {
            place();
          }
        }}
        onToggle={(event) => {
          if (event.newState === 'open') {
            place();
          } else {
            openedBy = undefined;
            clearTimeout(timer);
          }
        }}
      >
        {props.children(close)}
      </div>
    </>
  );
}

/**
 * An item of a `Flyout` menu: an icon and a label, with a keyboard shortcut after it. `checked` makes it one of a set
 * of choices, shown as chosen.
 */
export function FlyoutItem(props: {
  icon: SketchIconName;
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={styles.item}
      role={props.checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={props.checked === undefined ? undefined : props.checked ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <SketchIcon name={props.icon} size={20} />
      <span>{props.label}</span>
      {props.shortcut && <kbd>{props.shortcut}</kbd>}
    </button>
  );
}

/** CSS pixels between the button and its menu, and kept clear at the window's edges. */
const gap = 6;
const margin = 8;

/** A hovering pointer opens the menu after resting this long, and closes it this long after leaving it. */
const hoverOpenMs = 180;
const hoverCloseMs = 300;
