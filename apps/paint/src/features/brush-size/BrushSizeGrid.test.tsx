// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { BrushSizeGrid } from './BrushSizeGrid';
import {
  BRUSH_SIZE_PRESETS,
  GRID_CELL_HEIGHT,
  GRID_CELL_WIDTH,
  GRID_COLUMNS,
  GRID_HEADER,
  GRID_PADDING,
  placeSizeGrid
} from './sizeGrid';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('picks the size under the pen when it lifts, running between presets along a row', () => {
  const { pointer, cell, previews, picks, panel } = mount();
  pointer('pointerdown', 0, 300);
  expect(panel()).not.toBeNull();
  pointer('pointermove', ...cell(30));
  expect(previews.at(-1)).toBe(30);
  expect(panel()!.textContent).toContain('30 px');
  pointer('pointermove', ...cell(80, 0.999));
  expect(previews.at(-1)).toBe(89);
  pointer('pointerup', ...cell(80, 0.999));
  expect(picks).toEqual([89]);
  expect(panel()).toBeNull();
});

it('keeps the size when the pen lifts off the grid or Escape is pressed', () => {
  const { pointer, cell, previews, picks, panel } = mount();
  pointer('pointerdown', 0, 300);
  pointer('pointermove', ...cell(150));
  pointer('pointermove', 2000, 300);
  pointer('pointerup', 2000, 300);
  expect(picks).toEqual([]);
  expect(previews).toEqual([150, 24]);
  expect(panel()).toBeNull();

  pointer('pointerdown', 0, 300);
  pointer('pointermove', ...cell(40));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flush();
  expect(picks).toEqual([]);
  expect(previews.at(-1)).toBe(24);
  expect(panel()).toBeNull();
});

it('stays open after a tap, so a later tap picks a size and a tap elsewhere or on the button closes it', () => {
  const { pointer, cell, picks, panel } = mount();
  pointer('pointerdown', 0, 300);
  pointer('pointerup', 2, 301);
  expect(panel()).not.toBeNull();
  pointer('pointerdown', ...cell(150));
  pointer('pointerup', ...cell(150));
  expect(picks).toEqual([150]);
  expect(panel()).toBeNull();

  pointer('pointerdown', 0, 300);
  pointer('pointerup', 0, 300);
  pointer('pointerdown', 2000, 900);
  expect(picks).toEqual([150]);
  expect(panel()).toBeNull();

  pointer('pointerdown', 0, 300);
  pointer('pointerup', 0, 300);
  pointer('pointerdown', 0, 300);
  pointer('pointerup', 0, 300);
  expect(panel()).toBeNull();
});

it('opens while a pen hovers over the button, previews what it points at, and picks where it touches and lifts', async () => {
  const { pointer, cell, previews, picks, panel, hoverButton } = mount();
  await hoverButton();
  expect(panel()).not.toBeNull();
  pointer('pointermove', ...cell(40));
  expect(previews.at(-1)).toBe(40);
  // Touching down on 40 and sliding along the row to 80's right edge before lifting.
  pointer('pointerdown', ...cell(40));
  pointer('pointermove', ...cell(80, 0.999));
  pointer('pointerup', ...cell(80, 0.999));
  expect(picks).toEqual([89]);
  expect(panel()).toBeNull();
});

it('closes, keeping the size, when the hovering pen leaves the grid and the button or lifts out of range', async () => {
  const { pointer, cell, previews, picks, panel, hoverButton } = mount();
  await hoverButton();
  pointer('pointermove', ...cell(150));
  pointer('pointermove', 900, 700);
  expect(panel()).toBeNull();
  expect(previews).toEqual([150, 24]);

  await hoverButton();
  pointer('pointermove', ...cell(60));
  const out = new MouseEvent('pointerout', { bubbles: true, relatedTarget: null });
  Object.defineProperty(out, 'pointerType', { value: 'pen' });
  document.body.dispatchEvent(out);
  flush();
  expect(panel()).toBeNull();
  expect(previews.at(-1)).toBe(24);
  expect(picks).toEqual([]);
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const previews: number[] = [];
  const picks: number[] = [];
  dispose = render(() => {
    const [size, setSize] = createSignal(24);
    return (
      <BrushSizeGrid
        size={size()}
        max={512}
        onPreview={(next) => previews.push(next)}
        onPick={(next) => {
          picks.push(next);
          setSize(next);
        }}
      />
    );
  }, host);
  flush();
  const button = host.querySelector<HTMLButtonElement>('button')!;
  button.setPointerCapture = vi.fn();
  const panel = () => document.querySelector('[role="dialog"]');
  // jsdom lays nothing out, so the button sits at the origin and the grid opens against the viewport's left margin.
  const grid = () =>
    placeSizeGrid({
      presets: BRUSH_SIZE_PRESETS,
      min: 1,
      max: 512,
      current: 24,
      right: -10,
      y: 300,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
  /** Viewport point at `share` across the cell of `preset`, mid-height. */
  const cell = (preset: number, share = 0.5): [number, number] => {
    const placed = grid();
    const index = placed.presets.indexOf(preset);
    return [
      placed.left + GRID_PADDING + ((index % GRID_COLUMNS) + share) * GRID_CELL_WIDTH,
      placed.top + GRID_PADDING + GRID_HEADER + (Math.floor(index / GRID_COLUMNS) + 0.5) * GRID_CELL_HEIGHT
    ];
  };
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'pointerType', { value: 'pen' });
    (type === 'pointerdown' && !panel() ? button : document.body).dispatchEvent(event);
    flush();
  };
  /** A pen arriving above the button; pens open the grid without waiting. */
  const hoverButton = async () => {
    const event = new MouseEvent('pointerenter', { clientX: 0, clientY: 300 });
    Object.defineProperty(event, 'pointerType', { value: 'pen' });
    button.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
  };
  return { pointer, cell, previews, picks, panel, hoverButton };
}
