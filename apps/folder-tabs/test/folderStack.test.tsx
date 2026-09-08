import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

const ids = ['perceive', 'style', 'child', 'site', 'evolution', 'play', 'menu', 'music'];
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});

describe('folder transition sequence', () => {
  it('keeps each tab and panel in one motion owner and ignores descendant completions', () => {
    const f = fixture();
    const tab = document.querySelector('#tab-music')!;
    expect(tab.parentElement).toBe(f.card('music'));
    expect(f.panel('music').parentElement).toBe(f.card('music'));
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-owns')?.split(' ')).toContain(tab.id);
    f.drag(300, 450);
    expect(f.card('music').classList.contains('is-departing')).toBe(true);
    expect(tab.classList.contains('is-departing')).toBe(false);
    expect(f.panel('music').classList.contains('is-departing')).toBe(false);
    f.end('music', 'folder-exit', tab);
    f.end('music', 'folder-exit', f.panel('music'));
    expect(f.stack.dataset.motion).toBe('departing');
    expect(f.selected()).toBe('tab-music');
    f.end('music', 'folder-exit');
    expect(f.selected()).toBe('tab-menu');
    f.end('music', 'folder-return');
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it('reveals the underlying content and moves the remaining stack during a held drag', () => {
    const f = fixture();
    const original = f.offset('perceive');
    f.pointer('pointerdown', 300);
    f.pointer('pointermove', 450);
    expect(f.card('menu').classList.contains('is-revealed')).toBe(true);
    expect(f.panel('menu').querySelector('.board-title')?.textContent).toBe('AI Generation Place');
    expect(f.offset('perceive')).toBeGreaterThan(original);
    expect(f.stack.style.getPropertyValue('--drag-offset')).toBe('150px');
    expect(f.selected()).toBe('tab-music');
  });

  it('reorders only after exit, then returns once without restarting the exit', () => {
    const f = fixture();
    f.drag(300, 450);
    expect(f.stack.dataset.motion).toBe('departing');
    expect(f.selected()).toBe('tab-music');
    expect(f.card('music').classList.contains('is-departing')).toBe(true);
    expect(f.card('menu').classList.contains('is-revealed')).toBe(true);
    expect(f.stack.querySelector('.folder-echo')).not.toBeNull();
    expect(f.offset('perceive')).toBe(3.33);
    f.end('music', 'dial-spin', f.panel('music').querySelector('.dial-rotor')!);
    expect(f.stack.dataset.motion).toBe('departing');
    f.end('music', 'folder-exit');
    expect(f.selected()).toBe('tab-menu');
    expect(f.stack.querySelector('.folder-echo')).toBeNull();
    expect(f.card('music').classList.contains('is-returning')).toBe(true);
    expect(f.card('music').classList.contains('is-departing')).toBe(false);
    expect(f.offset('perceive')).toBe(3.33);
    f.end('music', 'folder-exit');
    expect(f.stack.dataset.motion).toBe('returning');
    f.end('music', 'folder-return');
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
    expect(f.card('menu').classList.contains('is-revealed')).toBe(false);
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
    expect(f.stack.style.getPropertyValue('--extra-height')).toBe('21.8cqw');
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

  it('expands a compact strip before a subsequent downward swipe advances the deck', () => {
    const f = fixture();
    f.drag(450, 300);
    f.pointer('pointerdown', 300);
    f.pointer('pointermove', 380);
    expect(f.offset('music')).toBeCloseTo(10);
    expect(f.selected()).toBe('tab-music');
    f.pointer('pointerup', 380);
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.selected()).toBe('tab-music');
    expect(f.offset('music')).toBe(21.8);
    f.drag(300, 450);
    expect(f.stack.dataset.motion).toBe('departing');
    f.end('music', 'folder-exit');
    f.end('music', 'folder-return');
    expect(f.selected()).toBe('tab-menu');
  });

  it('restores either layout when its drag is cancelled', () => {
    const f = fixture();
    f.pointer('pointerdown', 450);
    f.pointer('pointermove', 380);
    f.pointer('pointercancel', 380);
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.offset('music')).toBe(21.8);
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
    expect(f.stack.querySelectorAll('.folder-card')).toHaveLength(8);
    for (const id of ids) expect(f.offset(id)).toBe(0);
    expect(document.querySelectorAll('[role="tabpanel"]:not([inert])')).toHaveLength(1);
  });

  it('moves all intervening cards together and waits for every wrapper before reordering', () => {
    const f = fixture();
    document.querySelector<HTMLButtonElement>('#tab-site')!.click();
    flush();
    const departing = ['music', 'menu', 'play', 'evolution'];
    expect(f.selected()).toBe('tab-music');
    expect(f.card('site').classList.contains('is-revealed')).toBe(true);
    expect(f.stack.querySelectorAll('.folder-echo')).toHaveLength(4);
    for (const id of departing) expect(f.card(id).classList.contains('is-departing')).toBe(true);
    for (const id of ['play', 'music', 'menu']) {
      f.end(id, 'folder-exit');
      f.end(id, 'folder-exit');
      expect(f.selected()).toBe('tab-music');
      expect(f.stack.dataset.motion).toBe('departing');
    }
    f.end('evolution', 'folder-exit');
    expect(f.selected()).toBe('tab-site');
    for (const id of departing) expect(f.card(id).classList.contains('is-returning')).toBe(true);
    for (const id of ['menu', 'evolution', 'music']) {
      f.end(id, 'folder-return');
      expect(f.stack.dataset.motion).toBe('returning');
    }
    f.end('play', 'folder-return');
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
    f.end('music', 'folder-exit');
    f.end('music', 'folder-return');
    expect(f.selected()).toBe('tab-menu');
    expect(f.card('menu').classList.contains('is-departing')).toBe(true);
    f.end('menu', 'folder-exit');
    f.end('menu', 'folder-return');
    expect(f.selected()).toBe('tab-play');
    expect(f.stack.dataset.motion).toBe('idle');
    expect(f.stack.dataset.selectionTarget).toBeUndefined();
  });

  it.each([false, true])('opens the rear tab where a downward drag began (compact: %s)', (compact) => {
    const f = fixture();
    if (compact) f.drag(450, 300);
    const label = document.querySelector('#tab-style .tab-label')!;
    f.pointer('pointerdown', 100, label);
    // Subsequent events go to the capturing stack, not the original label.
    f.pointer('pointermove', 250);
    f.pointer('pointerup', 250);
    expect(f.stack.dataset.selectionTarget).toBe('style');
    expect(f.stack.dataset.layout).toBe('stacked');
    expect(f.stack.dataset.motion).toBe('departing');
    const outgoing = ['child', 'site', 'evolution', 'play', 'menu', 'music'];
    for (const id of outgoing) expect(f.card(id).classList.contains('is-departing')).toBe(true);
    for (const id of outgoing) f.end(id, 'folder-exit');
    for (const id of outgoing) f.end(id, 'folder-return');
    expect(f.selected()).toBe('tab-style');
    expect(f.stack.dataset.motion).toBe('idle');
  });

  it('does not select a rear tab after cancellation or a sideways rail drag', () => {
    const f = fixture();
    f.drag(450, 300);
    const label = document.querySelector('#tab-style .tab-label')!;
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
    for (const id of ['music', 'menu']) f.end(id, 'folder-exit');
    for (const id of ['music', 'menu']) f.end(id, 'folder-return');
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
    f.panel('play').querySelector<HTMLButtonElement>('.next-control')!.click();
    flush();
    expect(f.stack.dataset.motion).toBe('departing');
    f.end('play', 'folder-exit');
    f.end('play', 'folder-return');
    expect(f.selected()).toBe('tab-evolution');
  });
});

function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(() => <App />, host));
  flush();
  const stack = host.querySelector<HTMLDivElement>('.folder-stack')!;
  const captured = new Set<number>();
  Object.defineProperties(stack, {
    clientWidth: { value: 800 },
    clientHeight: { value: 868 },
    setPointerCapture: { value: (id: number) => captured.add(id) },
    releasePointerCapture: { value: (id: number) => captured.delete(id) },
    hasPointerCapture: { value: (id: number) => captured.has(id) }
  });
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-folder="${id}"]`)!;
  const panel = (id: string) => host.querySelector<HTMLElement>(`#panel-${id}`)!;
  function pointer(type: string, y: number, target: Element = stack, x = 50) {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y
      })
    );
    flush();
  }
  return {
    stack,
    panel,
    card,
    order: () =>
      [...ids].sort(
        (a, b) => Number(card(a).style.getPropertyValue('--rank')) - Number(card(b).style.getPropertyValue('--rank'))
      ),
    pointer,
    selected: () => host.querySelector('[aria-selected="true"]')?.id,
    offset: (id: string) => parseFloat(card(id).style.getPropertyValue('--offset')),
    drag(from: number, to: number) {
      pointer('pointerdown', from);
      pointer('pointermove', to);
      pointer('pointerup', to);
    },
    end(id: string, animationName: string, target: Element = card(id)) {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', { value: animationName });
      target.dispatchEvent(event);
      flush();
    }
  };
}
