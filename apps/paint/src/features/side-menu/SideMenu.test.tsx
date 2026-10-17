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

it('frames the content with even margins, clipped where the panel begins, and covers it where there is no room', () => {
  const tablet = { width: 1646, height: 909 };
  expect(menuGeometry(tablet)).toEqual({ panel: 380, beside: 380 });
  expect(cardFrame(tablet, 'right', 0)).toEqual({
    transform: 'translate(0px, 0px) scale(1)',
    clipPath: 'inset(0 0px 0 0 round 0px)'
  });

  // Open, the card spans from 16 px off the left, top and bottom edges to the panel.
  const scale = (909 - 32) / 909;
  const open = frameNumbers(cardFrame(tablet, 'right', 1));
  expect(open.x).toBe(16);
  expect(open.y).toBe(16);
  expect(open.scale).toBeCloseTo(scale);
  expect(open.x + (1646 - open.right) * scale).toBeCloseTo(1646 - 380);

  // From the left, the card's right edge keeps the margin and the clip falls on the left.
  const left = frameNumbers(cardFrame(tablet, 'left', 1));
  expect(left.x + 1646 * scale).toBeCloseTo(1646 - 16);
  expect(left.x + left.left * scale).toBeCloseTo(380);

  expect(menuGeometry({ width: 360, height: 700 })).toEqual({ panel: 360, beside: 16 });
});

/** The numbers in a `cardFrame` result: translation, scale and the clip's right and left insets. */
function frameNumbers(frame: ReturnType<typeof cardFrame>) {
  const [x = NaN, y = NaN, scale = NaN] = [...frame.transform.matchAll(/-?[\d.]+/g)].map(Number);
  const [, right = NaN, , left = NaN] = [...frame.clipPath.matchAll(/-?[\d.]+/g)].map(Number);
  return { x, y, scale, right, left };
}

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
