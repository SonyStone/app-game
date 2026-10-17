// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cardFrame, menuGeometry, SideMenu, SideMenuGroup, SideMenuItem } from './SideMenu';

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

it('frames the content with even margins and draws its far edge back off the panel, or lets a panel cover it', () => {
  const tablet = { width: 1646, height: 909 };
  expect(menuGeometry(tablet)).toEqual({ panel: 380, covers: false });
  expect(cardFrame(tablet, 'right', 0)).toMatchObject({ transform: 'translate(0px, 0px) scale(1)', width: '100%' });

  // Open, the card sits 16 px off the top, bottom and outer edge and ends where the panel begins, rounded to 14 px.
  const scale = (909 - 32) / 909;
  const open = cardFrame(tablet, 'right', 1);
  expect(open.transform).toBe(`translate(16px, 16px) scale(${scale})`);
  expect(16 + parseFloat(open.width) * scale).toBeCloseTo(1646 - 380);
  expect(open.radius * scale).toBeCloseTo(14);

  // From the left, the card keeps the margin on the right and begins where the panel ends.
  const left = cardFrame(tablet, 'left', 1);
  expect(left.transform).toBe(`translate(380px, 16px) scale(${scale})`);
  expect(380 + parseFloat(left.width) * scale).toBeCloseTo(1646 - 16);

  // A phone's panel covers a card with even margins all round.
  const phone = { width: 360, height: 700 };
  expect(menuGeometry(phone)).toEqual({ panel: 360, covers: true });
  expect(16 + parseFloat(cardFrame(phone, 'right', 1).width) * ((700 - 32) / 700)).toBeCloseTo(360 - 16);
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
    // The card, around the box that isolates the content's stacking.
    content: () => host.querySelector('[data-testid="content"]')!.parentElement!.parentElement!,
    back: () => host.querySelector<HTMLButtonElement>('button[aria-label="Back"]'),
    item: (name: string) =>
      [...host.querySelectorAll<HTMLElement>('nav button')].find((button) => button.textContent === name)!,
    opened,
    onOpen,
    onPen
  };
}
