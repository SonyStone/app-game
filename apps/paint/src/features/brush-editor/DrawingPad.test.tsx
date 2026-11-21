// @vitest-environment jsdom
import type { BrushPreview } from '@app-game/brush-preview';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { DrawingPad } from './DrawingPad';

type PreviewProps = Parameters<typeof BrushPreview>[0];

const preview = vi.hoisted(() => ({ props: undefined as PreviewProps | undefined }));

// The pad's canvas needs WebGPU; keep its props to see what the pad asks of it.
vi.mock('@app-game/brush-preview', () => ({
  BrushPreview: (props: PreviewProps) => {
    preview.props = props;
    props.onStrokes?.(0);
    return null;
  }
}));

let dispose: (() => void) | undefined;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 400, height: 300 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  preview.props = undefined;
  document.body.replaceChildren();
});

it('redraws its strokes with the edited brush, unless "Keep strokes as drawn" is checked', () => {
  mount();
  expect(preview.props?.redraw).toBe(true);
  expect(preview.props?.restyle).toBe(true);

  const options = document.querySelector<HTMLButtonElement>('button[aria-label="Pad options"]')!;
  expect(options.getAttribute('aria-haspopup')).toBe('menu');
  options.click();
  flush();
  const keep = document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!;
  expect(keep.textContent).toBe('Keep strokes as drawn');
  expect(keep.getAttribute('aria-checked')).toBe('false');
  keep.click();
  flush();
  expect(preview.props?.restyle).toBe(false);
  options.click();
  flush();
  expect(document.querySelector('[role="menuitemcheckbox"]')!.getAttribute('aria-checked')).toBe('true');
});

it('offers Undo and Clear as buttons of their own', () => {
  mount();
  const undo = vi.fn();
  const clear = vi.fn();
  preview.props!.actions!({ undo, redo: vi.fn(), clear });
  buttonNamed('Undo').click();
  buttonNamed('Clear').click();
  expect(undo).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledOnce();
});

it('invites a stroke while the pad is empty', () => {
  mount();
  const hint = () => document.body.textContent!.includes('Draw here to try the brush');
  expect(hint()).toBe(true);
  preview.props!.onStrokes!(1);
  flush();
  expect(hint()).toBe(false);
  preview.props!.onStrokes!(0);
  flush();
  expect(hint()).toBe(true);
});

it('washes the pad in a mid-tone while the brush erases, so erasing shows', () => {
  const [brush, setBrush] = mount();
  expect(preview.props?.backdrop).toBeUndefined();
  setBrush({ ...brush(), tool: 'eraser' });
  flush();
  expect(preview.props?.backdrop).toMatch(/^#[\da-f]{6}$/);
  // The eraser's version of an ABR brush erases through the Clear mode.
  setBrush({ ...defaultBrush(), engine: { id: 'abr', settings: { blendMode: 'Cler' } } });
  flush();
  expect(preview.props?.backdrop).toMatch(/^#[\da-f]{6}$/);
});

function mount() {
  const signal = createSignal<Brush>(defaultBrush());
  const host = document.body.appendChild(document.createElement('div'));
  dispose = render(() => <DrawingPad brush={signal[0]()} />, host);
  flush();
  return signal;
}

function buttonNamed(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text
  )!;
}
