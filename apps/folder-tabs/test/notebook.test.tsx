import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { expect, it } from 'vitest';
import { Notebook } from '../examples/Notebook';

it('recreates the demo at the chosen size, including while a previous selection is animating', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => <Notebook />, host);
  try {
    flush();
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const control = host.querySelector('select')!;
    expect(tabs()).toHaveLength(4);
    const oldPanel = host.querySelector('[role="tabpanel"]');
    const draft = host.querySelector<HTMLInputElement>('textarea')!;
    draft.value = 'Still here';
    const spacing = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    spacing.value = '150';
    spacing.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(host.querySelector('output')?.textContent).toBe('150%');
    expect(host.querySelector('[role="tabpanel"]')).toBe(oldPanel);
    expect(draft.value).toBe('Still here');
    tabs()[0]!.click();
    flush();
    expect(host.querySelector('[data-tabs-root]')?.getAttribute('data-motion')).toBe('departing');
    for (const count of [100, 7, 1, 4]) {
      control.value = String(count);
      control.dispatchEvent(new Event('change', { bubbles: true }));
      flush();
      expect(tabs()).toHaveLength(count);
      expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(count);
      expect(new Set(tabs().map((tab) => tab.id)).size).toBe(count);
      expect(new Set(tabs().map((tab) => tab.textContent)).size).toBe(count);
      expect(tabs().at(-1)?.getAttribute('aria-selected')).toBe('true');
      expect(host.querySelector('[data-tabs-root]')?.getAttribute('data-motion')).toBe('idle');
      expect(host.querySelector('[data-tabs-echo]')).toBeNull();
      expect(spacing.value).toBe('150');
    }
    expect(oldPanel?.isConnected).toBe(false);
  } finally {
    dispose();
    host.remove();
  }
});

it('keeps an inspected rear card within the expanded limit after release', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => <Notebook />, host);
  try {
    flush();
    const select = host.querySelector('select')!;
    select.value = '40';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flush();
    const root = host.querySelector<HTMLElement>('[data-tabs-root]')!;
    Object.assign(root, { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} });
    const tab = root.querySelector('[data-tabs-trigger="ideas"]')!;
    const pointer = (type: string, target: Element, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: y
      });
      target.dispatchEvent(event);
      flush();
    };
    pointer('pointerdown', tab, 100);
    pointer('pointermove', root, 134);
    pointer('pointerup', root, 134);
    expect(root.dataset.layout).toBe('stacked');
    const exposed = [...root.querySelectorAll<HTMLElement>('[data-tabs-card]:not([data-stack-hidden])')];
    expect(exposed).toHaveLength(8);
    expect(exposed.some((card) => card.dataset.tabsCard === 'ideas')).toBe(true);
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toBe('Notes 10');
  } finally {
    dispose();
    host.remove();
  }
});
