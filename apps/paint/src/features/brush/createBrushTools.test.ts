// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createBrushTools } from './createBrushTools';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('keeps separate brush, ABR and eraser settings while sharing colors', () => {
  const tools = setup();
  // Commands in one event, before any flush, must build on each other.
  tools.updateBrush({ size: 30, color: '#ff0000' });
  tools.selectPreset({ id: 'abr', settings: {} }, { size: 2500, spacing: 0.1 });
  flush();
  expect(tools.brush()).toMatchObject({ size: 2500, color: '#ff0000', engine: { id: 'abr' } });

  tools.chooseTool('eraser');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'eraser', engine: undefined, color: '#ff0000' });
  expect(tools.brush().size).not.toBe(2500);
  tools.updateBrush({ size: 80 });
  tools.chooseTool('brush');
  flush();
  expect(tools.brush()).toMatchObject({ tool: 'brush', size: 30, color: '#ff0000' });
  expect(tools.eraser()).toMatchObject({ tool: 'eraser', size: 80, color: '#ff0000' });

  tools.chooseTool('abr-brush');
  flush();
  expect(tools.brush()).toMatchObject({ size: 2500, engine: { id: 'abr' } });
});

it('swaps and resets colors, and limits sizes per engine', () => {
  const tools = setup();
  tools.updateBrush({ color: '#123456', backgroundColor: '#abcdef' });
  tools.swapColors();
  flush();
  expect(tools.brush()).toMatchObject({ color: '#abcdef', backgroundColor: '#123456' });
  tools.resetColors();
  tools.scaleSize(1000);
  flush();
  expect(tools.brush()).toMatchObject({ color: '#000000', backgroundColor: '#ffffff', size: 512 });

  tools.selectPreset({ id: 'abr', settings: {} }, { size: 4000 });
  tools.scaleSize(2);
  flush();
  expect(tools.brush().size).toBe(5000);
});

function setup() {
  return createRoot((stop) => {
    dispose = stop;
    return createBrushTools();
  });
}
