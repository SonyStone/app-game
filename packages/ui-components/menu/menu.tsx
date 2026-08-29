import { computePosition, offset } from '@floating-ui/dom';
import type { JSX } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { For, Show, createSignal, onCleanup, onSettled } from 'solid-js';
import { Ripple } from '../ripple/Ripple';

type MenuItem = {
  /** Stable value passed to the action callback. */
  key: string;
  /** Visible item label. */
  label: string;
};

const ITEMS: readonly MenuItem[] = [
  { key: 'copy', label: 'Copy' },
  { key: 'cut', label: 'Cut' },
  { key: 'paste', label: 'Paste' }
];

/** Renders the menu example without Solid-1-only ARIA and transition packages. */
export function Menu(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  let popup: HTMLDivElement | undefined;

  onSettled(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && !trigger?.contains(target) && !popup?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open()) {
        setOpen(false);
        trigger?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    });
  });

  const openMenu = () => {
    setOpen(true);
    queueMicrotask(() => popup?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
  };

  return (
    <div class="relative inline-block">
      <button
        ref={(element) => {
          trigger = element;
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open() ? 'true' : 'false'}
        class="rounded-2 relative flex gap-2 border px-4 py-2"
        onClick={() => (open() ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        Actions
        <span aria-hidden="true" class={['transition-transform', { 'rotate-180': open() }]}>
          ▼
        </span>
        <Ripple />
      </button>

      <Portal>
        <Show when={open()}>
          <div
            ref={(element) => {
              popup = element;
              void element.animate([{ opacity: 0, transform: 'translateY(-10%)' }, { opacity: 1 }], {
                duration: 150
              }).finished;
              void computePosition(trigger!, element, {
                placement: 'bottom-start',
                middleware: [offset()]
              }).then(({ x, y }) => {
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
              });
            }}
            role="menu"
            class="rounded-2 absolute overflow-hidden border bg-white shadow"
          >
            <For each={ITEMS}>
              {(item) => (
                <button
                  type="button"
                  role="menuitem"
                  class="hover:bg-gray focus:bg-gray relative block w-full cursor-pointer px-4 py-2 text-left outline-none focus:text-white"
                  onClick={() => {
                    console.log(item.key);
                    setOpen(false);
                    trigger?.focus();
                  }}
                >
                  {item.label}
                  <Ripple />
                </button>
              )}
            </For>
          </div>
        </Show>
      </Portal>
    </div>
  );
}
