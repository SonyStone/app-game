// @vitest-environment jsdom
import type { LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createCustomToolbar } from './createCustomToolbar';
import { availableInPaint } from './createToolActions';
import { HistoryControls } from './HistoryControls';
import { LayerPanel } from './LayerPanel';
import { dragTravel, slidFraction } from './MainToolbar';
import { editingTools } from './toolCatalog';
import { ToolsMenu } from './ToolsMenu';

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  localStorage.clear();
});

it('slides a virtual slider by the drag height over the travel, up raising it, within 0–1', () => {
  expect(slidFraction(0.5, -dragTravel / 4)).toBeCloseTo(0.75);
  expect(slidFraction(0.5, dragTravel / 2)).toBe(0);
  expect(slidFraction(0.9, -dragTravel)).toBe(1);
});

it('docks entries on the custom toolbar at a slot, moves docked ones, undocks and remembers them', () => {
  const toolbar = createRoot((done) => {
    dispose = done;
    return createCustomToolbar();
  });
  toolbar.dock('fill', 0);
  toolbar.dock('flip', 5);
  toolbar.dock('lazy', 1);
  flush();
  expect(toolbar.ids()).toEqual(['fill', 'lazy', 'flip']);

  toolbar.dock('flip', 0);
  flush();
  expect(toolbar.ids()).toEqual(['flip', 'fill', 'lazy']);

  toolbar.undock('fill');
  flush();
  expect(toolbar.ids()).toEqual(['flip', 'lazy']);
  dispose?.();

  localStorage.setItem('paint.infinite.toolbar', JSON.stringify(['lazy', 'no-such-tool', 'flip']));
  const restored = createRoot((done) => {
    dispose = done;
    return createCustomToolbar();
  });
  expect(restored.ids()).toEqual(['lazy', 'flip']);
});

it('shows the tools menu with the entries Paint lacks disabled and runs the others', () => {
  const onRun = vi.fn();
  const host = mount(() => (
    <ToolsMenu
      label="Editing Tools"
      sections={editingTools}
      available={availableInPaint}
      active={(id) => id === 'select-wand'}
      onRun={onRun}
    />
  ));
  const entry = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!;

  expect(entry('Liquify').disabled).toBe(true);
  expect(entry('Wand').getAttribute('aria-pressed')).toBe('true');
  entry('Lasso').click();
  expect(onRun).toHaveBeenCalledWith('select-lasso');
});

it('selects a layer with a tap, opens the active one’s options with another and shows its badges', () => {
  const layers: LayerInfo[] = [
    { id: 'a', name: 'Paper texture', visible: true, opacity: 1, blend: 'normal' },
    { id: 'b', name: 'Shadows', visible: true, opacity: 0.59, blend: 'multiply', clipping: true }
  ];
  const actions: LayerAction[] = [];
  const host = mount(() => (
    <LayerPanel
      layers={layers}
      activeId="b"
      expanded={false}
      onExpanded={() => {}}
      ready
      onAction={(action) => actions.push(action)}
    />
  ));
  const thumbnail = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label^="${name}"]`)!;

  expect(thumbnail('Shadows').textContent).toContain('Multiply');
  expect(thumbnail('Shadows').textContent).toContain('59%');
  expect(host.textContent).toContain('↳');

  thumbnail('Paper texture').click();
  flush();
  expect(actions).toEqual([{ type: 'select', id: 'a' }]);
  expect(host.querySelector('[role="dialog"]')).toBeNull();

  thumbnail('Shadows').click();
  flush();
  const options = host.querySelector('[role="dialog"][aria-label="Options of Shadows"]');
  expect(options).toBeTruthy();
  const merge = [...options!.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Merge')
  )!;
  merge.click();
  expect(actions.at(-1)).toEqual({ type: 'merge-down', id: 'b' });
});

it('shows Redo only with something to redo and the history button only after an undo', () => {
  const [canRedo, setCanRedo] = createSignal(false);
  const onUndo = vi.fn(() => setCanRedo(true));
  const host = mount(() => (
    <HistoryControls
      canUndo
      canRedo={canRedo()}
      states={5}
      current={4}
      onUndo={onUndo}
      onRedo={() => {}}
      onStep={() => {}}
    />
  ));
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  expect(button('Redo')).toBeNull();
  expect(button('Undo history')).toBeNull();

  button('Undo')!.click();
  flush();
  expect(onUndo).toHaveBeenCalledOnce();
  expect(button('Redo')).toBeTruthy();
  button('Undo history')!.click();
  flush();
  expect(host.querySelector('[role="slider"][aria-label="Undo history"]')?.getAttribute('aria-valuenow')).toBe('4');
});

/** Renders `view` into a fresh element of the document and returns it. */
function mount(view: () => ReturnType<typeof LayerPanel>) {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}
