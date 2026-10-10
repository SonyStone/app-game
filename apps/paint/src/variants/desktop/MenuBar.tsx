import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import type { Command, Menu } from './createDesktopCommands';
import { formatKeys } from './keys';
import styles from './MenuBar.module.css';

/**
 * The menu bar of a desktop application: menu titles that open their menu on press, and while one is open, a hovering
 * pen or mouse slides to the next title's menu. A chosen item closes the menu before it runs, so the pen draws next.
 * Arrow keys move between menus and items. `open` and `onOpen` let the caller close the menu on outside presses and
 * Escape; the bar is marked `data-popup` for that. `children` go to the bar's right end.
 */
export function MenuBar(props: {
  menus: readonly Menu[];
  /** The open menu's id. */
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
  /** Shortcuts are shown with the Mac's symbols. */
  apple: boolean;
  children?: JSX.Element;
}) {
  let bar!: HTMLElement;
  const step = (offset: number) => {
    const index = props.menus.findIndex((menu) => menu.id === props.open);
    const next = props.menus[(index + offset + props.menus.length) % props.menus.length];
    props.onOpen(next?.id);
  };
  const focusItem = (offset: number) => {
    const items = [...bar.querySelectorAll<HTMLButtonElement>('[data-menu-item]:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[index < 0 ? (offset > 0 ? 0 : items.length - 1) : (index + offset + items.length) % items.length]?.focus();
  };

  return (
    <nav
      ref={bar}
      class={styles.bar}
      aria-label="Menu bar"
      data-popup
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' && props.open) {
          event.preventDefault();
          step(1);
        } else if (event.key === 'ArrowLeft' && props.open) {
          event.preventDefault();
          step(-1);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!props.open) {
            const title = (event.target as Element).closest<HTMLElement>('[data-menu]');
            props.onOpen(title?.dataset.menu);
          }

          // The menu renders on the next flush.
          queueMicrotask(() => focusItem(event.key === 'ArrowDown' ? 1 : -1));
        }
      }}
    >
      <div class={styles.menus} role="menubar">
        <For each={props.menus}>
          {(menu) => (
            <div class={styles.menu}>
              <button
                class={styles.title}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={props.open === menu.id ? 'true' : 'false'}
                data-menu={menu.id}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }

                  event.preventDefault();
                  props.onOpen(props.open === menu.id ? undefined : menu.id);
                }}
                onClick={(event) => {
                  // Presses open on pointer down; this is Enter or Space.
                  if (event.detail === 0) {
                    props.onOpen(props.open === menu.id ? undefined : menu.id);
                  }
                }}
                onPointerEnter={() => {
                  if (props.open && props.open !== menu.id) {
                    props.onOpen(menu.id);
                  }
                }}
              >
                {menu.label}
              </button>
              <Show when={props.open === menu.id}>
                <div class={styles.dropdown} role="menu" aria-label={menu.label}>
                  <For each={menu.items}>
                    {(item) =>
                      item === 'separator' ? (
                        <hr class={styles.separator} />
                      ) : (
                        <MenuItem
                          command={item}
                          apple={props.apple}
                          onChoose={() => {
                            props.onOpen(undefined);
                            item.run();
                          }}
                        />
                      )
                    }
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class={styles.end}>{props.children}</div>
    </nav>
  );
}

/** One command of an open menu: a check mark for settings, the label and the shortcut. */
function MenuItem(props: { command: Command; apple: boolean; onChoose: () => void }) {
  const checked = () => props.command.checked?.();

  return (
    <button
      class={styles.item}
      role={checked() === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked() === undefined ? undefined : checked() ? 'true' : 'false'}
      disabled={props.command.enabled ? !props.command.enabled() : false}
      data-menu-item
      onClick={() => props.onChoose()}
    >
      <span class={styles.check} aria-hidden="true">
        {checked() ? '✓' : ''}
      </span>
      <span class={styles.label}>{props.command.label}</span>
      <span class={styles.keys}>{props.command.keys ? formatKeys(props.command.keys, props.apple) : ''}</span>
    </button>
  );
}
