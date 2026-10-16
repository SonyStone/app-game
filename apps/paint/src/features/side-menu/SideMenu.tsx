import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createContext, createEffect, createSignal, createUniqueId, Show, untrack, useContext } from 'solid-js';
import styles from './SideMenu.module.css';

/**
 * A menu that slides in from the side and pushes the content aside instead of covering it: the content steps back into
 * a dimmed card beside the panel, and a press on the card brings it back. The pill in the corner on the panel's side
 * opens and closes the menu; its label rolls over on hover, and it turns into a round close button while the menu is
 * open. The panel's entries (`SideMenuGroup`, `SideMenuItem`) rise into view one after another.
 *
 * The menu is controlled: `open` is the caller's, and `onOpenChange` receives every request to change it, from the
 * pill, the card, Escape and the entries. `progress` previews a gesture toward opening, 0 to 1, following it without
 * animation (see `createStepBack`); when it ends, the menu animates to `open`.
 *
 * The root fills its positioned parent and measures itself, so the menu also works in a box smaller than the window.
 * The content keeps its layout size while it shrinks, as only a transform moves it; while the menu is open it is
 * inert. Opening moves focus to the first entry, and closing returns it to the pill.
 */
export function SideMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel's entries. */
  menu: JSX.Element;
  /** The content that steps back, such as the drawing stage. */
  children: JSX.Element;
  /** The edge the panel slides from; `right` by default. */
  side?: 'left' | 'right';
  /** The pill's label and the panel's accessible name; `Menu` by default. */
  label?: string;
  progress?: number;
  class?: string;
}) {
  const [root, setRoot] = createSignal<HTMLElement>();
  const [panel, setPanel] = createSignal<HTMLElement>();
  const [pill, setPill] = createSignal<HTMLButtonElement>();
  const size = createElementSize(root);
  const panelId = createUniqueId();
  const side = () => props.side ?? 'right';
  const label = () => props.label ?? 'Menu';
  const amount = () => props.progress ?? (props.open ? 1 : 0);
  // Layout sizes, which a transformed ancestor, such as the component canvas's zoom, leaves alone.
  const geometry = () => menuGeometry({ width: size.clientWidth ?? 0, height: size.clientHeight ?? 0 });
  /** The card's transform at `amount`: it moves toward the free side as it shrinks. */
  const cardTransform = () => {
    const { scale, shift } = geometry();
    const t = amount();
    return `translateX(${(side() === 'right' ? -shift : shift) * t}px) scale(${1 - (1 - scale) * t})`;
  };
  const close = () => props.onOpenChange(false);

  createEventListener(
    () => (props.open ? window : undefined),
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
  );
  // Entries rise one after another in document order; the order is read when the menu opens, so it may change.
  createEffect(
    () => ({ open: props.open, panel: panel() }),
    ({ open, panel }) => {
      if (!panel) {
        return;
      }

      if (open) {
        panel.querySelectorAll<HTMLElement>('[data-side-menu-entry]').forEach((entry, index) => {
          entry.style.setProperty('--entry', String(index));
        });
        panel.querySelector<HTMLElement>(focusable)?.focus({ preventScroll: true });
      } else if (panel.contains(document.activeElement)) {
        untrack(pill)?.focus({ preventScroll: true });
      }
    }
  );

  return (
    <div
      ref={setRoot}
      class={[styles.root, props.class]}
      data-side={side()}
      data-open={props.open ? '' : undefined}
      data-revealed={props.open || amount() > revealAt ? '' : undefined}
      data-following={props.progress === undefined ? undefined : ''}
      style={{ '--panel-width': `${geometry().panel}px` }}
    >
      <div
        class={styles.card}
        style={{ transform: cardTransform(), 'border-radius': `${cardRadius * amount()}px` }}
        inert={props.open || props.progress !== undefined}
      >
        {props.children}
        <div class={styles.shade} style={{ opacity: shadeOpacity * amount() }} />
      </div>
      <Show when={props.open}>
        <button class={styles.back} style={{ transform: cardTransform() }} aria-label="Back" onClick={close} />
      </Show>
      <nav
        ref={setPanel}
        id={panelId}
        class={styles.panel}
        aria-label={label()}
        inert={!props.open}
        style={{
          transform: `translateX(${(side() === 'right' ? 100 : -100) * (1 - amount())}%)`
        }}
      >
        <SideMenuContext value={{ close }}>{props.menu}</SideMenuContext>
      </nav>
      <button
        ref={setPill}
        class={styles.pill}
        aria-expanded={props.open ? 'true' : 'false'}
        aria-controls={panelId}
        aria-label={props.open ? `Close ${label().toLowerCase()}` : label()}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <span class={styles.pillLabel} aria-hidden="true">
          <span>{label()}</span>
          <span>{label()}</span>
        </span>
        <span class={styles.pillIcon} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A group of the panel's entries under an optional small caption, divided from the group before it. `small` sets
 * secondary entries in small type, as the links under a site's navigation.
 */
export function SideMenuGroup(props: { caption?: string; small?: boolean; children: JSX.Element }) {
  return (
    <div class={styles.group} role="group" aria-label={props.caption} data-small={props.small ? '' : undefined}>
      <Show when={props.caption}>
        <p class={styles.caption} data-side-menu-entry>
          <span>{props.caption}</span>
        </p>
      </Show>
      {props.children}
    </div>
  );
}

/**
 * An entry of the panel: a button, or a link with `href`. Hovering it draws a dash before it and dims its neighbours.
 * Choosing it closes the menu before `onSelect` runs, unless `keepOpen`; `onSelect` still runs within the click, so
 * it may open a file picker. `note` follows the name in small type, such as a file format.
 */
export function SideMenuItem(props: {
  children: JSX.Element;
  onSelect?: () => void;
  href?: string;
  note?: string;
  disabled?: boolean;
  keepOpen?: boolean;
}) {
  const menu = useContext(SideMenuContext);
  const content = (
    <span>
      <i class={styles.dash} aria-hidden="true" />
      {props.children}
      <Show when={props.note}>
        <small class={styles.note}>{props.note}</small>
      </Show>
    </span>
  );
  const choose = () => {
    if (!props.keepOpen) {
      menu?.close();
    }

    props.onSelect?.();
  };

  return (
    <Show
      when={props.href}
      fallback={
        <button class={styles.item} data-side-menu-entry disabled={props.disabled} onClick={choose}>
          {content}
        </button>
      }
    >
      {(href) => (
        <a class={styles.item} data-side-menu-entry href={href()} onClick={choose}>
          {content}
        </a>
      )}
    </Show>
  );
}

/**
 * Where the menu puts the panel and the card in a root of `size`: the panel's width, and the card's scale and its
 * shift toward the free side, so that the whole content shows in the room the panel leaves, `margin` from its edges.
 * A root too narrow to leave room keeps the content nearly whole under a panel that covers it.
 */
export function menuGeometry(size: { width: number; height: number }) {
  const panel = Math.min(maxPanelWidth, size.width - minCardRoom);
  if (size.width <= 0 || size.height <= 0 || panel < minPanelWidth) {
    return { panel: Math.max(0, Math.min(maxPanelWidth, size.width)), scale: narrowScale, shift: 0 };
  }

  const room = size.width - panel;
  const scale = Math.min((room - margin * 2) / size.width, (size.height - margin * 2) / size.height);
  return { panel, scale, shift: panel / 2 };
}

/** Closes the menu for the entries inside its panel. */
const SideMenuContext = createContext<{ close: () => void }>();

/** The first entry that takes focus. */
const focusable = 'button:not(:disabled), a[href]';

/** Progress past which a gesture shows the entries, as a sign that lifting now opens the menu. */
const revealAt = 0.6;

/** CSS pixels of the card's rounding when fully stepped back. */
const cardRadius = 14;

/** How dark the stepped-back card gets. */
const shadeOpacity = 0.22;

/** The panel's widest, in CSS pixels. */
const maxPanelWidth = 380;

/** The panel's narrowest beside the card, in CSS pixels; a root with less room gets a panel over the content. */
const minPanelWidth = 240;

/** The narrowest card worth showing beside the panel, in CSS pixels. */
const minCardRoom = 280;

/** CSS pixels between the card and the room's edges. */
const margin = 20;

/** The card's scale under a panel that covers it. */
const narrowScale = 0.94;
