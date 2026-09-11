import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import motionStyles from '../../../packages/card-stack/src/CardStack.module.css';
import { App } from '../src/App';
import dialStyles from '../src/Dial.module.css';
import contentStyles from '../src/FolderContent.module.css';
import stackStyles from '../src/FolderStack.module.css';

const ids = ['perceive', 'style', 'child', 'site', 'evolution', 'play', 'menu', 'music'];
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('folder transition sequence', () => {
  it.each([1600, -2400])('settles a row pulled beyond its end (%s) against the edge', (dx) => {
    const f = fixture('touch');
    f.drag(450, 300);
    f.advance(240);
    const order = f.tabs();
    const left = (id: string) => parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
    const start = left('music');
    f.pointer('pointerdown', 100, document.querySelector('#tab-music')!, 400);
    f.pointer('pointermove', 100, f.stack, 400 + dx);
    expect(left('music')).toBeCloseTo(start + dx / 8);
    f.pointer('pointerup', 100, f.stack, 400 + dx);
    expect(left('music')).toBeCloseTo(start + dx / 8);
    f.advance(480);
    if (dx > 0) expect(left(order[0]!)).toBeCloseTo(3);
    else expect(left(order.at(-1)!) + 30).toBeCloseTo(97);
    order.slice(1).forEach((id, index) => expect(left(id) - left(order[index]!)).toBeCloseTo(28));
    expect(f.tabs()).toEqual(order);
    expect(f.selected()).toBe('tab-music');
  });

  it.each([-800, 800])('returns an expanded tab dragged beyond the screen (%s) without losing its sort order', (dx) => {
    const f = fixture('touch');
    f.advance(240);
    const left = (id: string) => parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
    const before = left('play');
    f.pointer('pointerdown', 200, document.querySelector('#tab-play')!, 400);
    f.pointer('pointermove', 200, f.stack, 400 + dx);
    expect(left('play')).toBeCloseTo(before + dx / 8);
    const order = f.tabs();
    f.pointer('pointerup', 200, f.stack, 400 + dx);
    // Return follows the existing motion, rather than teleporting at pointer-up.
    expect(left('play')).toBeCloseTo(before + dx / 8);
    f.advance(480);
    ids.forEach((id) => {
      expect(left(id)).toBeGreaterThanOrEqual(3 - 0.001);
      expect(left(id)).toBeLessThanOrEqual(67 + 0.001);
    });
    expect(f.tabs()).toEqual(order);
    expect(f.selected()).toBe('tab-music');
  });

  it('brings every handle back into the field after unfolding a scrolled row', () => {
    const f = fixture('touch');
    f.drag(450, 300);
    f.advance(240);
    f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 400);
    f.pointer('pointermove', 100, f.stack, -1000);
    f.pointer('pointerup', 100, f.stack, -1000);
    f.advance(480);
    f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 100);
    f.pointer('pointermove', 300, f.stack, 100);
    f.pointer('pointerup', 300, f.stack, 100);
    f.advance(480);
    ids.forEach((id) => {
      const left = parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
      expect(left).toBeGreaterThanOrEqual(3 - 0.001);
      expect(left).toBeLessThanOrEqual(67 + 0.001);
    });
  });
  it('accepts a deliberate short pull on a tab and uses the final release coordinate', () => {
    const f = fixture('touch');
    const tab = document.querySelector('#tab-play')!;
    f.pointer('pointerdown', 200, tab, 50, 0);
    f.pointer('pointermove', 207, f.stack, 50, 500);
    f.pointer('pointerup', 170, f.stack, 50, 1000);
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.selected()).toBe('tab-music');
    f.advance(240);
    f.pointer('pointerdown', 200, tab, 50, 2000);
    f.pointer('pointermove', 230, f.stack, 50, 2500);
    f.pointer('pointerup', 320, f.stack, 50, 3000);
    expect(f.stack.dataset.selectionTarget).toBe('play');
    for (const id of ['music', 'menu']) f.end(id, 'tabs-exit');
    for (const id of ['music', 'menu']) f.end(id, 'tabs-return');
    expect(f.selected()).toBe('tab-play');
  });

  it('does not select after releasing below the selection threshold, even after a deeper pull', () => {
    const f = fixture('touch');
    const order = f.order();
    f.pointer('pointerdown', 100, f.tab('style'));
    f.pointer('pointermove', 350);
    f.advance(240);
    f.pointer('pointermove', 130);
    f.pointer('pointerup', 130);
    f.advance(240);
    expect(f.order()).toEqual(order);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it.each(['mouse', 'touch'] as const)(
    'grabs an unfinished layout with %s at its painted position and keeps it attached',
    (pointerType) => {
      const f = fixture(pointerType);
      f.drag(450, 300);
      f.advance(3); // The deck is still gathering, not at its final rows or rail positions.
      const y = f.painted('play');
      const x = parseFloat(f.tab('play').style.getPropertyValue('--painted-left'));
      f.pointer('pointerdown', 200, document.querySelector('#tab-play')!);
      f.pointer('pointermove', 216);
      expect(f.painted('play')).toBeCloseTo(y + 2);
      expect(parseFloat(f.tab('play').style.getPropertyValue('--painted-left'))).toBeCloseTo(x);
      f.advance(10);
      expect(f.painted('play')).toBeCloseTo(y + 2);
      expect(parseFloat(f.tab('play').style.getPropertyValue('--painted-left'))).toBeCloseTo(x);
      f.pointer('pointermove', 264);
      expect(f.painted('play')).toBeCloseTo(y + 8);
      f.pointer('pointermove', 200);
      expect(f.painted('play')).toBeCloseTo(y);
      f.pointer('pointercancel', 200);
      f.advance(240);
      expect(f.selected()).toBe('tab-music');
      ids.forEach((id) => expect(f.painted(id)).toBeCloseTo(0));
    }
  );

  it.each(['mouse', 'touch'] as const)('sorts expanded tabs with %s without changing card depth', (pointerType) => {
    const f = fixture(pointerType);
    f.advance(240);
    const left = (id: string) => parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
    const original = new Map(ids.map((id) => [id, left(id)]));
    const depth = f.order();
    const width = f.stack.style.getPropertyValue('--tab-width');
    f.pointer('pointerdown', 200, document.querySelector('#tab-play')!, 350);
    f.pointer('pointermove', 200, f.stack, 450);
    expect(f.tabs()).toEqual(['music', 'style', 'site', 'play', 'menu', 'perceive', 'evolution', 'child']);
    f.advance(240);
    expect(left('site')).toBeCloseTo(original.get('play')!);
    expect(left('play')).toBeCloseTo(original.get('play')! + 12.5);
    expect(f.order()).toEqual(depth);
    expect(f.selected()).toBe('tab-music');
    f.pointer('pointermove', 200, f.stack, 210);
    expect(f.tabs()[0]).toBe('play');
    f.advance(240);
    const held = left('play');
    f.pointer('pointerup', 200, f.stack, 210);
    f.advance(240);
    expect(left('play')).toBeCloseTo(held);
    expect(left('music')).toBeCloseTo(original.get('style')!);
    expect(left('style')).toBeCloseTo(original.get('play')!);
    expect(left('site')).toBeCloseTo(original.get('site')!);
    expect(f.order()).toEqual(depth);
    expect(f.stack.style.getPropertyValue('--tab-width')).toBe(width);
    const expandedOrder = [...ids].sort((a, b) => left(a) - left(b));
    expect(expandedOrder).toEqual(f.tabs());
    f.pointer('pointerdown', 400, document.querySelector('#tab-play')!, 210);
    f.pointer('pointermove', 100, f.stack, 210);
    f.pointer('pointerup', 100, f.stack, 210);
    f.advance(240);
    expect([...ids].sort((a, b) => left(a) - left(b))).toEqual(expandedOrder);
    expect(left('play')).toBeCloseTo(3);
  });

  it.each([
    ['menu', 0],
    ['menu', 100],
    ['music', 160],
    ['child', -160]
  ] as const)('anchors %s on gathering without leaving an edge gap (horizontal delta: %s)', (id, dx) => {
    const f = fixture('touch');
    f.advance(240);
    const left = () => parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
    const initial = left();
    f.pointer('pointerdown', 400, document.querySelector(`#tab-${id}`)!, 400);
    f.pointer('pointermove', 100, f.stack, 400 + dx);
    f.advance(120);
    const held = left();
    expect(held).toBeCloseTo(initial + dx / 8);
    f.pointer('pointerup', 100, f.stack, 400 + dx);
    expect(left()).toBeCloseTo(held);
    const naturalLeft = 3 + f.tabs().indexOf(id) * 28;
    const maxScroll = 6 + 7 * 28 + 30 - 100;
    const offset = Math.max(0, Math.min(maxScroll, naturalLeft - held));
    f.advance(240);
    expect(left()).toBeCloseTo(naturalLeft - offset);
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.selected()).toBe('tab-music');
    const buttonWidth = f.stack.style.getPropertyValue('--tab-width');
    f.pointer('pointerdown', 100, document.querySelector(`#tab-${id}`)!, 400);
    f.pointer('pointermove', 100, f.stack, 320);
    f.pointer('pointerup', 100, f.stack, 320);
    f.advance(240);
    expect(left()).toBeCloseTo(naturalLeft - Math.min(maxScroll, offset + 10));
    expect(f.stack.style.getPropertyValue('--tab-width')).toBe(buttonWidth);
  });

  it('scrolls all tabs together while they are gathered in one row', () => {
    const f = fixture('touch');
    f.drag(450, 300);
    f.advance(240);
    const left = (id: string) => parseFloat(f.tab(id).style.getPropertyValue('--painted-left'));
    const initial = ids.map(left);
    f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 400);
    f.pointer('pointermove', 100, f.stack, 280);
    ids.forEach((id, i) => expect(left(id)).toBeCloseTo(initial[i]! - 15));
    f.pointer('pointerup', 100, f.stack, 280);
    f.advance(240);
    ids.forEach((id, i) => expect(left(id)).toBeCloseTo(initial[i]! - 15));
    expect(f.selected()).toBe('tab-music');
  });

  it('changes from row scrolling to sorting during the same curved gesture', () => {
    const f = fixture('touch');
    f.drag(450, 300);
    f.advance(240);
    const original = f.tabs();
    f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 400);
    f.pointer('pointermove', 100, f.stack, 320);
    expect(f.tabs()).toEqual(original);
    f.pointer('pointermove', 300, f.stack, 320);
    f.advance(240);
    expect(f.tabs()).toEqual(original);
    f.pointer('pointermove', 300, f.stack, 420);
    expect(f.tabs()).toEqual(['music', 'style', 'site', 'menu', 'perceive', 'play', 'evolution', 'child']);
    f.pointer('pointerup', 300, f.stack, 420);
    f.advance(240);
    expect(f.tabs()[5]).toBe('play');
  });

  it.each(['pointercancel', 'reverse'] as const)('restores sorting on %s', (ending) => {
    const f = fixture();
    f.advance(240);
    const tabs = f.tabs();
    const rows = ids.map(f.offset);
    f.pointer('pointerdown', 200, document.querySelector('#tab-play')!, 350);
    f.pointer('pointermove', 200, f.stack, 550);
    f.advance(240);
    expect(f.tabs()).not.toEqual(tabs);
    if (ending === 'reverse') {
      f.pointer('pointermove', 200, f.stack, 350);
      f.pointer('pointerup', 200, f.stack, 350);
    } else f.pointer('pointercancel', 200, f.stack, 550);
    f.advance(240);
    expect(f.tabs()).toEqual(tabs);
    expect(ids.map(f.offset)).toEqual(rows);
    expect(f.selected()).toBe('tab-music');
  });

  it('opens the sheet underneath after sorting, rather than a horizontal neighbor', () => {
    const f = fixture();
    f.advance(240);
    f.pointer('pointerdown', 300, document.querySelector('#tab-music')!, 100);
    f.pointer('pointermove', 300, f.stack, 600);
    f.pointer('pointerup', 300, f.stack, 600);
    f.advance(240);
    const tabs = f.tabs();
    expect(tabs.at(-1)).toBe('music');
    expect(tabs[tabs.indexOf('music') - 1]).toBe('child');
    f.pointer('pointerdown', 100, document.querySelector('#tab-music')!, 600);
    f.pointer('pointermove', 1000, f.stack, 600);
    f.pointer('pointerup', 1000, f.stack, 600);
    finishSelection(f);
    f.advance(240);
    expect(f.selected()).toBe('tab-menu');
    expect(f.tabs()).toEqual(tabs);
    document.querySelector<HTMLButtonElement>('#tab-style')!.click();
    flush();
    for (const id of ['child', 'site', 'evolution', 'play', 'menu']) f.end(id, 'tabs-exit');
    for (const id of ['child', 'site', 'evolution', 'play', 'menu']) f.end(id, 'tabs-return');
    expect(f.selected()).toBe('tab-style');
    expect(f.tabs()).toEqual(tabs);
  });

  it.each([false, true])('only collapses when pulling a rear tab up (compact: %s)', (compact) => {
    const f = fixture();
    if (compact) f.drag(450, 300);
    f.advance(240);
    const order = f.order();
    f.pointer('pointerdown', 300, document.querySelector('#tab-play')!);
    f.pointer('pointermove', 220);
    expect(f.stack.querySelector('[data-revealed]')).toBeNull();
    expect(f.selected()).toBe('tab-music');
    expect(f.order()).toEqual(order);
    f.pointer('pointerup', 220);
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.order()).toEqual(order);
    f.advance(240);
    ids.forEach((id) => expect(f.painted(id)).toBeCloseTo(0));
  });

  it('gathers without selection when a downward pull reverses upward', () => {
    const f = fixture('touch');
    f.pointer('pointerdown', 300, document.querySelector('#tab-play')!);
    f.pointer('pointermove', 420);
    expect(f.card('play').hasAttribute('data-revealed')).toBe(false);
    f.advance(8);
    f.pointer('pointermove', 200);
    expect(f.stack.querySelector('[data-revealed]')).toBeNull();
    f.pointer('pointerup', 200);
    f.advance(240);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.stack.dataset.motion).toBe('idle');
    ids.forEach((id) => expect(f.painted(id)).toBeCloseTo(0));
  });

  it('hands an unfinished click selection to a drag without jumping or replaying the cancelled batch', () => {
    const f = fixture();
    vi.spyOn(f.card('play'), 'getBoundingClientRect').mockImplementation(
      () => ({ top: 60 + f.painted('play') * 8 }) as DOMRect
    );
    document.querySelector<HTMLButtonElement>('#tab-play')!.click();
    flush();
    f.advance(8);
    const held = f.painted('play');
    // The browser paints CSS exit animations independently of the RAF follower.
    vi.spyOn(f.card('play'), 'getBoundingClientRect').mockReturnValue({ top: 60 + held * 8 } as DOMRect);
    vi.spyOn(f.card('perceive'), 'getBoundingClientRect').mockReturnValue({
      top: 60 + f.painted('perceive') * 8
    } as DOMRect);
    vi.spyOn(f.card('music'), 'getBoundingClientRect').mockReturnValue({ top: 460 } as DOMRect);
    vi.spyOn(f.card('menu'), 'getBoundingClientRect').mockReturnValue({ top: 420 } as DOMRect);
    f.pointer('pointerdown', 200, document.querySelector('#tab-play')!);
    expect(f.stack.dataset.motion).toBe('departing'); // a tap still uses the click sequence
    f.dispatchPointer('pointermove', 220);
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.hasAttribute('data-dragging')).toBe(true);
    expect(f.painted('music')).toBeCloseTo(50);
    expect(f.painted('menu')).toBeCloseTo(45);
    f.advance(1);
    expect(f.painted('play')).toBeCloseTo(held + 20 / 8);
    f.pointer('pointermove', 260);
    expect(f.painted('play')).toBeCloseTo(held + 60 / 8);
    f.pointer('pointercancel', 260);
    for (const id of ['music', 'menu']) f.end(id, 'tabs-exit');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.selected()).toBe('tab-music');
    f.advance(240);
    for (const id of ids) expect(f.painted(id)).toBeCloseTo(f.offset(id));
  });

  it.each(['mouse', 'touch'] as const)(
    'lets a returning tab be grabbed with %s before its animation ends',
    (pointerType) => {
      const f = fixture(pointerType);
      vi.spyOn(f.card('menu'), 'getBoundingClientRect').mockImplementation(
        () => ({ top: 60 + f.painted('menu') * 8 }) as DOMRect
      );
      document.querySelector<HTMLButtonElement>('#tab-menu')!.click();
      flush();
      f.end('music', 'tabs-exit');
      expect(f.stack.dataset.motion).toBe('returning');
      const anchor = f.painted('perceive');
      vi.spyOn(f.card('perceive'), 'getBoundingClientRect').mockReturnValue({ top: 60 + anchor * 8 } as DOMRect);
      vi.spyOn(f.card('music'), 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
      f.pointer('pointerdown', 110, document.querySelector('#tab-music')!);
      f.pointer('pointermove', 130);
      expect(f.painted('music')).toBeCloseTo(7.5);
      expect(f.stack.dataset.motion).toBe('idle');
      f.pointer('pointermove', 230);
      expect(f.painted('music')).toBeCloseTo(20);
      f.pointer('pointerup', 230);
      expect(f.stack.dataset.motion).toBe('departing');
      // An old return completion cannot finish the new exit sequence.
      f.end('music', 'tabs-return');
      for (const id of ids.filter((id) => id !== 'music')) f.end(id, 'tabs-exit');
      expect(f.selected()).toBe('tab-music');
      for (const id of ids.filter((id) => id !== 'music')) f.end(id, 'tabs-return');
      expect(f.stack.dataset.motion).toBe('idle');
    }
  );

  it('hands a click animation to a horizontal drag without blocking either axis', () => {
    const f = fixture();
    f.drag(450, 200);
    document.querySelector<HTMLButtonElement>('#tab-play')!.click();
    flush();
    const button = document.querySelector('#tab-play')!;
    const x = parseFloat(f.tab('play').style.getPropertyValue('--painted-left'));
    f.pointer('pointerdown', 80, button, 300);
    f.pointer('pointermove', 80, f.stack, 400);
    expect(parseFloat(f.tab('play').style.getPropertyValue('--painted-left'))).toBeCloseTo(x + 12.5);
    expect(f.stack.dataset.motion).toBe('idle');
    f.pointer('pointerup', 80, f.stack, 400);
    for (const id of ['menu', 'music']) f.end(id, 'tabs-exit');
    expect(f.selected()).toBe('tab-music');
  });

  it('keeps each tab and panel in one motion owner and ignores descendant completions', () => {
    const f = fixture();
    const tab = document.querySelector('#tab-music')!;
    expect(tab.parentElement).toBe(f.card('music'));
    expect(f.panel('music').parentElement).toBe(f.card('music'));
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-owns')?.split(' ')).toContain(tab.id);
    document.querySelector<HTMLButtonElement>('#tab-menu')!.click();
    flush();
    expect(f.card('music').classList.contains('is-departing')).toBe(true);
    expect(tab.classList.contains('is-departing')).toBe(false);
    expect(f.panel('music').classList.contains('is-departing')).toBe(false);
    f.end('music', 'tabs-exit', tab);
    f.end('music', 'tabs-exit', f.panel('music'));
    expect(f.stack.dataset.motion).toBe('departing');
    expect(f.selected()).toBe('tab-music');
    f.end('music', 'tabs-exit');
    expect(f.selected()).toBe('tab-menu');
    f.end('music', 'tabs-return');
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it('spreads the existing depth during a held drag without previewing another selection', () => {
    const f = fixture();
    const original = f.offset('perceive');
    f.pointer('pointerdown', 300);
    f.pointer('pointermove', 450);
    expect(f.card('menu').hasAttribute('data-revealed')).toBe(false);
    expect(f.panel('menu').querySelector(`.${contentStyles.boardTitle}`)?.textContent).toBe('AI Generation Place');
    expect(f.offset('perceive')).toBe(original);
    expect(f.offset('play')).toBeGreaterThan(13.4);
    expect(f.stack.style.getPropertyValue('--drag-offset')).toBe('150px');
    expect(f.selected()).toBe('tab-music');
  });

  it('reorders only after exit, then returns once without restarting the exit', () => {
    const f = fixture();
    document.querySelector<HTMLButtonElement>('#tab-menu')!.click();
    flush();
    expect(f.stack.dataset.motion).toBe('departing');
    expect(f.selected()).toBe('tab-music');
    expect(f.card('music').classList.contains('is-departing')).toBe(true);
    expect(f.card('menu').hasAttribute('data-revealed')).toBe(true);
    expect(f.stack.querySelector('.folder-echo')).toBeNull();
    expect(f.offset('perceive')).toBe(0);
    expect(parseFloat(f.card('perceive').style.getPropertyValue('--reveal-end'))).toBe(1.6);
    f.end('music', 'dial-spin', f.panel('music').querySelector(`.${dialStyles.dialRotor}`)!);
    expect(f.stack.dataset.motion).toBe('departing');
    f.end('music', 'tabs-exit');
    expect(f.selected()).toBe('tab-menu');
    expect(f.stack.querySelector('.folder-echo')).toBeNull();
    expect(f.card('music').classList.contains('is-returning')).toBe(true);
    expect(f.card('music').classList.contains('is-departing')).toBe(false);
    expect(f.offset('perceive')).toBe(1.6);
    expect(parseFloat(f.card('perceive').style.getPropertyValue('--reveal-end'))).toBe(1.6);
    f.end('music', 'tabs-exit');
    expect(f.stack.dataset.motion).toBe('returning');
    f.end('music', 'tabs-return');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.selected()).toBe('tab-menu');
    expect(f.card('music').classList.contains('is-returning')).toBe(false);
  });

  it('restores the stack after cancellation without changing the selected folder', () => {
    const f = fixture();
    f.pointer('pointerdown', 300);
    f.pointer('pointermove', 400);
    f.pointer('pointercancel', 400);
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.selected()).toBe('tab-music');
    expect(f.offset('perceive')).toBe(0);
    expect(f.card('menu').hasAttribute('data-revealed')).toBe(false);
    expect(f.stack.style.getPropertyValue('--drag-offset')).toBe('0px');
  });

  it('pulls the current card upward and gathers the whole stack without changing selection', () => {
    const f = fixture();
    const original = f.offset('music');
    f.pointer('pointerdown', 450);
    f.pointer('pointermove', 370);
    expect(f.selected()).toBe('tab-music');
    expect(f.offset('music')).toBeCloseTo(original - 10);
    expect(f.offset('play')).toBeLessThan(15.6);
    expect(f.stack.querySelector('.is-preview, .is-entering')).toBeNull();
    f.pointer('pointerup', 370);
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.querySelector('.folder-echo')).toBeNull();
    for (const id of ids) expect(f.offset(id)).toBe(0);
    const slots = ids.map((id) => parseFloat(f.card(id).style.getPropertyValue('--left')));
    expect(new Set(slots).size).toBe(8);
    expect(parseFloat(f.stack.style.getPropertyValue('--extra-height'))).toBeCloseTo(original);
  });

  it('lays full-size tabs along a scrollable rail without changing their spatial order', () => {
    const f = fixture();
    const original = new Map(ids.map((id) => [id, parseFloat(f.card(id).style.getPropertyValue('--left'))]));
    f.drag(450, 300);
    const sorted = [...ids].sort((a, b) => original.get(a)! - original.get(b)!);
    const lefts = sorted.map((id) => parseFloat(f.card(id).style.getPropertyValue('--left')));
    lefts.forEach((left, index) => {
      if (index) expect(left - lefts[index - 1]!).toBe(28);
    });
    expect(lefts.at(-1)! + 30).toBeGreaterThan(100);
    document.querySelector<HTMLButtonElement>('[aria-label="Scroll folders right"]')!.click();
    flush();
    expect(f.stack.dataset.railOffset).toBe('56');
    expect(f.selected()).toBe('tab-music');
    document.querySelector<HTMLButtonElement>('#tab-music')!.focus();
    flush();
    expect(f.stack.dataset.railOffset).toBe('0');
    f.drag(300, 450);
    for (const id of ids) expect(parseFloat(f.card(id).style.getPropertyValue('--left'))).toBe(original.get(id));
  });

  it('retains a partial pull and advances only when the held card reaches the bottom', () => {
    const f = fixture();
    f.drag(450, 300);
    f.advance(240);
    f.drag(300, 380);
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.selected()).toBe('tab-music');
    f.advance(240);
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 300);
    expect(f.selected()).toBe('tab-music');
    f.pointer('pointermove', 850);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.hasAttribute('data-dragging')).toBe(true);
    f.pointer('pointerup', 850);
    expect(f.stack.dataset.motion).toBe('departing');
    finishSelection(f);
    expect(f.selected()).toBe('tab-menu');
  });

  it('continues one compact pull past the expanded pose without a second grab', () => {
    const f = fixture();
    f.drag(450, 300);
    f.advance(240);
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 274.4);
    expect(f.painted('music')).toBeCloseTo(21.8);
    f.pointer('pointermove', 600);
    expect(f.painted('music')).toBeCloseTo(62.5);
    expect(f.selected()).toBe('tab-music');
    f.pointer('pointermove', 950);
    expect(f.selected()).toBe('tab-music');
    f.pointer('pointerup', 950);
    finishSelection(f);
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.selected()).toBe('tab-menu');
  });

  it.each(['mouse', 'touch'] as const)(
    'follows a curved %s path on both axes without releasing capture',
    (pointerType) => {
      const f = fixture(pointerType);
      f.drag(450, 300);
      f.advance(240);
      const x = parseFloat(f.tab('play').style.getPropertyValue('--painted-left'));
      const y = f.painted('play');
      f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 400);
      for (const [dx, dy] of [
        [-80, 0],
        [-120, 100],
        [20, 150],
        [80, 50],
        [0, 0]
      ]) {
        f.pointer('pointermove', 100 + dy!, f.stack, 400 + dx!);
        f.advance(5);
        expect(parseFloat(f.tab('play').style.getPropertyValue('--painted-left'))).toBeCloseTo(x + dx! / 8);
        expect(f.painted('play')).toBeCloseTo(y + dy! / 8);
        expect(f.stack.hasPointerCapture(1)).toBe(true);
        expect(f.stack.hasAttribute('data-dragging')).toBe(true);
      }
      f.pointer('pointerup', 100, f.stack, 400);
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.dataset.layout).toBe('compact');
    }
  );

  it.each(['mouse', 'touch'] as const)(
    'selects the held rear tab only after releasing a long %s gesture',
    (pointerType) => {
      const f = fixture(pointerType);
      f.drag(450, 300);
      f.advance(240);
      f.pointer('pointerdown', 100, document.querySelector('#tab-play')!, 400);
      f.pointer('pointermove', 220, f.stack, 440);
      f.advance(120);
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.dataset.motion).toBe('idle');
      expect(f.painted('play')).toBeCloseTo(15);
      expect(f.stack.hasPointerCapture(1)).toBe(true);
      f.pointer('pointermove', 950, f.stack, 500);
      f.advance(2);
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.hasPointerCapture(1)).toBe(true);
      f.pointer('pointerup', 950, f.stack, 500);
      expect(f.stack.dataset.selectionTarget).toBe('play');
      finishSelection(f);
      f.advance(240);
      expect(f.selected()).toBe('tab-play');
      expect(f.stack.dataset.motion).toBe('idle');
      for (const id of ids) expect(f.painted(id)).toBeCloseTo(f.offset(id));
    }
  );

  it('uses the final release position when a fast rear pull crosses the lower edge', () => {
    const f = fixture('touch');
    f.drag(450, 300);
    f.advance(240);
    f.pointer('pointerdown', 100, document.querySelector('#tab-play')!);
    f.pointer('pointermove', 200);
    f.pointer('pointerup', 950);
    finishSelection(f);
    expect(f.selected()).toBe('tab-play');
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it.each(['pointercancel', 'reverse'] as const)(
    'retains the original order when a rear pull ends with %s',
    (ending) => {
      const f = fixture('touch');
      const original = f.order();
      f.pointer('pointerdown', 100, document.querySelector('#tab-play')!);
      f.pointer('pointermove', 250);
      f.advance(120);
      expect(f.selected()).toBe('tab-music');
      expect(f.order()).toEqual(original);
      if (ending === 'reverse') {
        f.pointer('pointermove', 100);
        f.pointer('pointerup', 100);
      } else f.pointer('pointercancel', 250);
      f.advance(240);
      expect(f.order()).toEqual(original);
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.dataset.motion).toBe('idle');
    }
  );

  it.each([false, true])('spreads proportionally while held and restores on reversal (compact: %s)', (compact) => {
    const f = fixture();
    if (compact) f.drag(450, 300);
    f.advance(120);
    const before = ids.map((id) => f.offset(id));
    const paintedBefore = ids.map((id) => f.painted(id));
    const label = document.querySelector(`#tab-style .${stackStyles.tabLabel}`)!;
    f.pointer('pointerdown', 100, label);
    f.pointer('pointermove', 250);
    const outgoing = ['child', 'site', 'evolution', 'play', 'menu', 'music'];
    // Covering cards keep their painted positions until their own animation frame.
    for (const id of outgoing) {
      expect(f.painted(id)).toBe(paintedBefore[ids.indexOf(id)]);
    }
    f.advance(12);
    const moved = outgoing.map((id) => f.painted(id) - paintedBefore[ids.indexOf(id)]!);
    expect(moved.every((value) => value > 0 && value <= 51)).toBe(true);
    const depth = f.order();
    f.advance(240);
    const firstSpread = f.painted(depth.at(-1)!) - f.painted(depth[0]!);
    // Waiting at a fixed pointer position must not send covers a screen-height away.
    for (const id of outgoing) expect(f.painted(id) * 8).toBeLessThan(600);
    expect(f.order()).toEqual(depth);
    expect(f.stack.querySelector('[data-revealed], [data-tabs-echo], [data-phase]')).toBeNull();
    f.pointer('pointermove', 350);
    f.advance(240);
    expect(f.painted(depth.at(-1)!) - f.painted(depth[0]!)).toBeGreaterThan(firstSpread);
    expect(f.order()).toEqual(depth);
    expect(f.card('style').hasAttribute('data-revealed')).toBe(false);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.motion).toBe('idle');
    f.pointer('pointermove', 100);
    expect(ids.map((id) => f.offset(id))).toEqual(before);
    f.pointer('pointerup', 100);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.layout).toBe(compact ? 'compact' : 'stacked');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
    f.advance(240);
    expect(ids.map((id) => f.painted(id))).toEqual(before);
  });

  it('cancels an oversized compact pull without advancing or leaving preview offsets', () => {
    const f = fixture();
    f.drag(450, 300);
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 900);
    f.pointer('pointercancel', 900);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.stack.dataset.motion).toBe('idle');
    f.advance(240);
    for (const id of ids) expect(f.card(id).style.getPropertyValue('--card-drag-offset')).toBe('0px');
  });

  it('restores either layout when its drag is cancelled', () => {
    const f = fixture();
    const initial = f.offset('music');
    f.pointer('pointerdown', 450);
    f.pointer('pointermove', 380);
    f.pointer('pointercancel', 380);
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.offset('music')).toBe(initial);
    f.drag(450, 300);
    f.pointer('pointerdown', 300);
    f.pointer('pointermove', 380);
    f.pointer('pointercancel', 380);
    expect(f.stack.dataset.layout).toBe('compact');
    for (const id of ids) expect(f.offset(id)).toBe(0);
    expect(f.selected()).toBe('tab-music');
  });

  it('bounds rapid and oversized upward gestures without cycling any cards', () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) f.drag(450, -2000);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.layout).toBe('compact');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.querySelectorAll(`.${stackStyles.folderCard}`)).toHaveLength(8);
    for (const id of ids) expect(f.offset(id)).toBe(0);
    expect(document.querySelectorAll('[role="tabpanel"]:not([inert])')).toHaveLength(1);
  });

  it('keeps the revealed card behind the last cover and preserves its endpoint at the depth commit', () => {
    const f = fixture();
    f.tab('site').click();
    flush();
    const target = f.card('site');
    const moving = ['music', 'menu', 'play', 'evolution'];
    const value = (id: string, name: string) => parseFloat(f.card(id).style.getPropertyValue(name));
    const exits = moving.map((id) => ({
      start: value(id, '--exit-delay'),
      duration: value(id, '--exit-duration')
    }));
    expect(exits.map(({ start }) => start)).toEqual([0, 40, 80, 120]);
    expect(new Set(exits.map(({ start, duration }) => start + duration)).size).toBe(4);
    expect(target.dataset.phase).toBe('revealing');
    expect(value('site', '--reveal-delay')).toBe(exits.at(-1)!.start);
    expect(value('site', '--reveal-duration')).toBe(exits.at(-1)!.duration);
    const endpoint = value('site', '--reveal-end');
    f.advance(20);
    // The follower must not race ahead while CSS owns the reveal.
    expect(f.painted('site')).toBeCloseTo(f.offset('site'));
    for (const id of moving) f.end(id, 'tabs-exit');
    expect(f.selected()).toBe('tab-site');
    expect(target.dataset.phase).toBeUndefined();
    expect(f.painted('site')).toBeCloseTo(endpoint);
    f.advance(10);
    expect(f.painted('site')).toBeCloseTo(endpoint);
  });

  it('returns the original cards from beneath the selected sheet with distinct timings', () => {
    const f = fixture();
    f.tab('site').click();
    flush();
    const moving = ['music', 'menu', 'play', 'evolution'];
    const originals = moving.map((id) => f.card(id));
    expect(f.stack.querySelector('[data-tabs-echo]')).toBeNull();
    for (const id of moving) f.end(id, 'tabs-exit');
    const value = (id: string, key: string) => parseFloat(f.card(id).style.getPropertyValue(key));
    const starts = moving.map((id) => value(id, '--return-delay'));
    const ends = moving.map((id, index) => starts[index]! + value(id, '--return-duration'));
    expect(starts.every((start) => start >= 0)).toBe(true);
    expect(new Set(starts).size).toBe(4);
    expect(new Set(ends).size).toBe(4);
    moving.forEach((id, index) => {
      expect(f.card(id)).toBe(originals[index]);
      expect(value(id, '--return-start-offset')).toBeGreaterThan(f.offset('site') + 6);
    });
  });

  it.each([
    [false, 'play'],
    [true, 'play'],
    [false, 'music'],
    [true, 'music']
  ] as const)('spaces rear sheets evenly and clears the held content during diagonal inspection (compact: %s, held: %s)', (compact, held) => {
    const f = fixture();
    if (compact) f.drag(450, 300);
    f.advance(180);
    const before = ids.map((id) => f.painted(id));
    const rank = ids.indexOf(held);
    const rear = ids.slice(0, rank);
    const covering = ids.slice(rank + 1);
    f.pointer('pointerdown', 200, f.tab(held), 400);
    f.pointer('pointermove', 600, f.stack, 400);
    f.advance(240);
    // A long pull must reveal content, not leave only a narrow strip below the handle.
    covering.forEach((id) => expect((f.painted(id) - f.painted(held)) * 8).toBeGreaterThan(400));
    for (const [x, y] of [[-300, 850], [1100, 850], [1100, 650], [400, 700]] as const) {
      f.pointer('pointermove', y, f.stack, x);
      f.advance(240);
      rear.forEach((id, index) => expect(f.painted(id)).toBeCloseTo(f.painted(held) * index / rank));
      expect(f.painted(held)).toBeCloseTo(before[rank]! + (y - 200) / 8);
      covering.forEach((id) => expect((f.painted(id) - f.painted(held)) * 8).toBeGreaterThan(400));
      expect(f.order()).toEqual(ids);
      expect(f.selected()).toBe('tab-music');
    }
    f.pointer('pointercancel', 700);
    f.advance(240);
    ids.forEach((id, index) => expect(f.painted(id)).toBeCloseTo(before[index]!));
  });

  it('staggers intervening cards and waits for every wrapper before reordering', () => {
    const f = fixture();
    document.querySelector<HTMLButtonElement>('#tab-site')!.click();
    flush();
    const departing = ['music', 'menu', 'play', 'evolution'];
    expect(f.selected()).toBe('tab-music');
    expect(f.card('site').hasAttribute('data-revealed')).toBe(true);
    expect(f.stack.querySelectorAll('.folder-echo')).toHaveLength(0);
    for (const id of departing) expect(f.card(id).classList.contains('is-departing')).toBe(true);
    for (const id of ['play', 'music', 'menu']) {
      f.end(id, 'tabs-exit');
      f.end(id, 'tabs-exit');
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.dataset.motion).toBe('departing');
    }
    f.end('evolution', 'tabs-exit');
    expect(f.selected()).toBe('tab-site');
    for (const id of departing) expect(f.card(id).classList.contains('is-returning')).toBe(true);
    for (const id of ['menu', 'evolution', 'music']) {
      f.end(id, 'tabs-return');
      expect(f.stack.dataset.motion).toBe('returning');
    }
    f.end('play', 'tabs-return');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
    expect(f.order()).toEqual(['evolution', 'play', 'menu', 'music', 'perceive', 'style', 'child', 'site']);
  });

  it('can update a queued destination while an outgoing batch finishes', () => {
    const f = fixture();
    document.querySelector<HTMLButtonElement>('#tab-menu')!.click();
    flush();
    document.querySelector<HTMLButtonElement>('#tab-play')!.click();
    flush();
    f.end('music', 'tabs-exit');
    f.end('music', 'tabs-return');
    expect(f.selected()).toBe('tab-menu');
    expect(f.card('menu').classList.contains('is-departing')).toBe(true);
    f.end('menu', 'tabs-exit');
    f.end('menu', 'tabs-return');
    expect(f.selected()).toBe('tab-play');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
  });

  it.each([false, true])('opens the rear tab where a downward drag began (compact: %s)', (compact) => {
    const f = fixture();
    if (compact) f.drag(450, 300);
    const label = document.querySelector(`#tab-style .${stackStyles.tabLabel}`)!;
    f.pointer('pointerdown', 100, label);
    // Subsequent events go to the capturing stack, not the original label.
    f.pointer('pointermove', 250);
    f.pointer('pointerup', 250);
    expect(f.stack.dataset.selectionTarget).toBe('style');
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.stack.dataset.motion).toBe('departing');
    const outgoing = ['child', 'site', 'evolution', 'play', 'menu', 'music'];
    for (const id of outgoing) expect(f.card(id).classList.contains('is-departing')).toBe(true);
    for (const id of outgoing) f.end(id, 'tabs-exit');
    for (const id of outgoing) f.end(id, 'tabs-return');
    expect(f.selected()).toBe('tab-style');
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it('does not select a rear tab after cancellation or a sideways rail drag', () => {
    const f = fixture();
    f.drag(450, 300);
    const label = document.querySelector(`#tab-style .${stackStyles.tabLabel}`)!;
    f.pointer('pointerdown', 100, label);
    f.pointer('pointermove', 250);
    f.pointer('pointercancel', 250);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.layout).toBe('compact');
    f.pointer('pointerdown', 100, label, 400);
    f.pointer('pointermove', 101, f.stack, 392);
    f.pointer('pointermove', 102, f.stack, 250);
    f.pointer('pointerup', 102, f.stack, 250);
    expect(Number(f.stack.dataset.railOffset)).toBeGreaterThan(0);
    expect(f.selected()).toBe('tab-music');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
  });

  it('keeps compact cards aligned through batch selection and supports next controls', () => {
    const f = fixture();
    f.drag(450, 300);
    const slotsBefore = ids.map((id) => f.card(id).style.getPropertyValue('--left'));
    const heightBefore = f.stack.style.getPropertyValue('--extra-height');
    document.querySelector<HTMLButtonElement>('#tab-play')!.click();
    flush();
    for (const id of ['music', 'menu']) f.end(id, 'tabs-exit');
    for (const id of ['music', 'menu']) f.end(id, 'tabs-return');
    expect(f.selected()).toBe('tab-play');
    expect(f.stack.style.getPropertyValue('--extra-height')).toBe(heightBefore);
    for (const id of ids) expect(f.card(id).style.getPropertyValue('--extra-height')).toBe('');
    expect(f.stack.dataset.layout).toBe('compact');
    for (const id of ids) expect(f.offset(id)).toBe(0);
    const slots = ids.map((id) => parseFloat(f.card(id).style.getPropertyValue('--left')));
    expect(new Set(slots).size).toBe(8);
    expect(ids.map((id) => f.card(id).style.getPropertyValue('--left'))).toEqual(slotsBefore);
    expect(f.card('music').style.getPropertyValue('--left')).toBe('3%');
    expect(f.card('play').style.getPropertyValue('--left')).toBe('59%');
    // A panel's explicit Next command advances even when the strip is compact.
    f.panel('play').querySelector<HTMLButtonElement>(`.${contentStyles.nextControl}`)!.click();
    flush();
    expect(f.stack.dataset.motion).toBe('departing');
    f.end('play', 'tabs-exit');
    f.end('play', 'tabs-return');
    expect(f.selected()).toBe('tab-evolution');
  });
});

function fixture(pointerType: 'mouse' | 'touch' = 'mouse') {
  let time = 0;
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  function advance(count: number) {
    for (let i = 0; i < count; i++) {
      time += 1000 / 60;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
      flush();
    }
  }
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(() => <App />, host));
  flush();
  const stack = host.querySelector<HTMLDivElement>(`.${stackStyles.folderStack}`)!;
  const captured = new Set<number>();
  Object.defineProperties(stack, {
    clientWidth: { value: 800 },
    clientHeight: { value: 868 },
    setPointerCapture: { value: (id: number) => captured.add(id) },
    releasePointerCapture: { value: (id: number) => captured.delete(id) },
    hasPointerCapture: { value: (id: number) => captured.has(id) }
  });
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-tabs-card="${id}"]`)!;
  const panel = (id: string) => host.querySelector<HTMLElement>(`#panel-${id}`)!;
  function dispatchPointer(type: string, y: number, target: Element = stack, x = 50, timeStamp?: number) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType,
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y
    });
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    target.dispatchEvent(event);
    flush();
  }
  function pointer(...args: Parameters<typeof dispatchPointer>) {
    dispatchPointer(...args);
    // Observe the latest pointer position at its next rendered frame.
    if (args[0] === 'pointermove') advance(1);
  }
  return {
    stack,
    tabs: () => (stack.dataset.tabOrder ?? '').split(' '),
    advance,
    panel,
    card,
    tab: (id: string) => host.querySelector<HTMLButtonElement>(`#tab-${id}`)!,
    order: () =>
      [...ids].sort(
        (a, b) => Number(card(a).style.getPropertyValue('--rank')) - Number(card(b).style.getPropertyValue('--rank'))
      ),
    pointer,
    dispatchPointer,
    painted: (id: string) =>
      parseFloat(card(id).style.getPropertyValue('--painted-offset')) +
      parseFloat(card(id).style.getPropertyValue('--card-drag-offset')) / 8,
    selected: () => host.querySelector('[aria-selected="true"]')?.id,
    offset: (id: string) => parseFloat(card(id).style.getPropertyValue('--offset')),
    drag(from: number, to: number) {
      pointer('pointerdown', from);
      pointer('pointermove', to);
      pointer('pointerup', to);
    },
    end(id: string, animationName: string, target: Element = card(id)) {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', {
        value:
          animationName === 'tabs-exit'
            ? motionStyles.tabsExit
            : animationName === 'tabs-return'
              ? motionStyles.tabsReturn
              : animationName
      });
      target.dispatchEvent(event);
      flush();
    }
  };
}

/** Complete only the active selection batch, as wrapper CSS animations do in the browser. */
function finishSelection(f: ReturnType<typeof fixture>) {
  for (const id of ids) f.end(id, 'tabs-exit');
  for (const id of ids) f.end(id, 'tabs-return');
}
