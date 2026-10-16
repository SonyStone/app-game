// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { menuGeometry, SideMenu, SideMenuGroup, SideMenuItem } from './SideMenu';

let dispose: (() => void) | undefined;
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('opens from the pill, focuses the first entry and makes the content inert, and Escape brings it back', () => {
  const { pill, panel, content, item } = mount();
  expect(panel().hasAttribute('inert')).toBe(true);
  expect(content().hasAttribute('inert')).toBe(false);

  pill().click();
  flush();
  expect(pill().getAttribute('aria-expanded')).toBe('true');
  expect(panel().hasAttribute('inert')).toBe(false);
  expect(content().hasAttribute('inert')).toBe(true);
  expect(document.activeElement).toBe(item('Open'));

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  flush();
  expect(pill().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(pill());
});

it('closes before an entry runs, unless the entry keeps it open, and closes from the card', () => {
  const { pill, item, back, opened, onOpen, onPen } = mount();
  pill().click();
  flush();
  item('Open').click();
  flush();
  expect(onOpen).toHaveBeenCalledOnce();
  expect(opened()).toBe(false);

  pill().click();
  flush();
  item('Pen').click();
  flush();
  expect(onPen).toHaveBeenCalledOnce();
  expect(opened()).toBe(true);

  back()!.click();
  flush();
  expect(opened()).toBe(false);
  expect(back()).toBeNull();
});

it('fits the whole content into the room beside the panel, and covers it where there is no room', () => {
  const tablet = menuGeometry({ width: 1646, height: 909 });
  expect(tablet.panel).toBe(380);
  expect(tablet.shift).toBe(190);
  expect(tablet.scale).toBeCloseTo((1646 - 380 - 40) / 1646);

  const wide = menuGeometry({ width: 6000, height: 300 });
  expect(wide.scale).toBeCloseTo(260 / 300);

  expect(menuGeometry({ width: 360, height: 700 })).toEqual({ panel: 360, scale: 0.94, shift: 0 });
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const onOpen = vi.fn();
  const onPen = vi.fn();
  const [opened, setOpened] = createSignal(false);
  dispose = render(
    () => (
      <SideMenu
        open={opened()}
        onOpenChange={setOpened}
        menu={
          <>
            <SideMenuGroup caption="Drawing">
              <SideMenuItem onSelect={onOpen}>Open</SideMenuItem>
              <SideMenuItem disabled>Export</SideMenuItem>
            </SideMenuGroup>
            <SideMenuGroup small>
              <SideMenuItem keepOpen onSelect={onPen}>
                Pen
              </SideMenuItem>
            </SideMenuGroup>
          </>
        }
      >
        <p data-testid="content">Drawing</p>
      </SideMenu>
    ),
    host
  );
  flush();
  return {
    pill: () => host.querySelector<HTMLButtonElement>('button[aria-controls]')!,
    panel: () => host.querySelector('nav')!,
    content: () => host.querySelector('[data-testid="content"]')!.parentElement!,
    back: () => host.querySelector<HTMLButtonElement>('button[aria-label="Back"]'),
    item: (name: string) =>
      [...host.querySelectorAll<HTMLElement>('nav button')].find((button) => button.textContent === name)!,
    opened,
    onOpen,
    onPen
  };
}
