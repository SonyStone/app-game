// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrushOpacityPopup, BrushSizePopup, type OpacityTarget } from './BrushPopups';

let dispose: (() => void) | undefined;

beforeEach(() => {
  // The live preview draws once it scrolls into view, which jsdom never reports.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('shows the size in pixels on a geometric scale up to the brush’s largest size and steps it', () => {
  const onChange = vi.fn();
  const host = mount(() => <BrushSizePopup brush={{ ...defaultBrush(), size: 4.7 }} onChange={onChange} />);
  const size = slider(host, 'Size');

  expect(size.getAttribute('aria-valuetext')).toBe('4.7 px');
  expect(size.getAttribute('aria-valuemax')).toBe('512');
  expect(host.querySelector('[aria-label="Edit brush"]')).toBeNull();
  // 4.7 px sits past the middle of a 0.5–512 px geometric track, far from its linear place.
  expect(Number(size.style.getPropertyValue('--fraction'))).toBeCloseTo(Math.log(4.7 / 0.5) / Math.log(1024), 5);

  size.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(onChange).toHaveBeenLastCalledWith({ size: 4.8 });
});

it('reaches ABR sizes and opens the brush editor', () => {
  const onEdit = vi.fn();
  const brush: Brush = { ...defaultBrush(), size: 120, engine: { id: 'abr', settings: {} } };
  const host = mount(() => <BrushSizePopup brush={brush} onChange={() => {}} onEdit={onEdit} />);

  expect(slider(host, 'Size').getAttribute('aria-valuemax')).toBe('5000');
  expect(slider(host, 'Size').getAttribute('aria-valuetext')).toBe('120 px');
  host.querySelector<HTMLButtonElement>('[aria-label="Edit brush"]')!.click();
  expect(onEdit).toHaveBeenCalledOnce();
});

it('shows opacity, flow and softness, and highlights the parameter whose name is tapped', () => {
  const onChange = vi.fn();
  const host = mount(() => {
    const [target, setTarget] = createSignal<OpacityTarget>('opacity');
    return (
      <BrushOpacityPopup
        brush={{ ...defaultBrush(), opacity: 0.95, flow: 1, hardness: 0.56 }}
        onChange={onChange}
        target={target()}
        onTarget={setTarget}
      />
    );
  });

  expect(['Opacity', 'Flow', 'Softness'].map((name) => slider(host, name).getAttribute('aria-valuetext'))).toEqual([
    '95',
    '100',
    '44'
  ]);
  expect(highlighted(host)).toEqual(['Opacity']);

  label(host, 'Softness').click();
  flush();
  expect(highlighted(host)).toEqual(['Softness']);
  label(host, 'Flow').click();
  flush();
  expect(highlighted(host)).toEqual(['Flow']);

  slider(host, 'Softness').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(onChange).toHaveBeenLastCalledWith({ hardness: 1 - 0.45 });
  slider(host, 'Opacity').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.94 });
  slider(host, 'Flow').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(onChange).toHaveBeenLastCalledWith({ flow: 0.99 });
});

function mount(component: () => ReturnType<typeof BrushSizePopup>) {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(component, host);
  flush();
  return host;
}

function slider(host: HTMLElement, name: string) {
  return host.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
}

function label(host: HTMLElement, name: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === name)!;
}

function highlighted(host: HTMLElement) {
  return [...host.querySelectorAll('button[aria-pressed="true"]')].map((button) => button.textContent);
}
