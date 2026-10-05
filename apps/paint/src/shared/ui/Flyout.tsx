import type { JSX } from '@solidjs/web';
import { createUniqueId } from 'solid-js';
import styles from './Flyout.module.css';
import { SketchIcon, type SketchIconName } from './SketchIcon';

/**
 * A button of a `FloatingBar` that opens a small menu next to it, for choices and commands that need not stay in view,
 * such as the tool of a group or rarely used actions. `face` shows what the button stands for, such as the icon of the
 * current choice; a small corner mark tells it opens a menu. The menu is the browser's popover: it shows above
 * everything, below the button or above it where there is no room, and closes on a press outside it, on Escape, and
 * when `children` call `close`, as a chosen item does.
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
  const close = () => menu.hidePopover();
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
        // Before it shows, near the button; once it has a size, exactly.
        onBeforeToggle={(event) => {
          if (event.newState === 'open') {
            place();
          }
        }}
        onToggle={(event) => {
          if (event.newState === 'open') {
            place();
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
