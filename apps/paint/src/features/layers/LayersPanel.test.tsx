// @vitest-environment jsdom
import { createDocument } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { LayersPanel } from './LayersPanel';
import styles from './LayersPanel.module.css';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('preserves controls across worker snapshots and reorders, keeping focus on property updates', () => {
  const drawing = createDocument();
  drawing.changeLayer({ type: 'add' });
  const initial = drawing.state();
  const first = initial.layers[0]!;
  const [state, setState] = createSignal(initial);
  const [ready] = createSignal(true);
  const layer = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <LayersPanel state={state()} ready={ready()} onAction={layer} />, host);
  flush();

  const eye = host.querySelector<HTMLButtonElement>(`[aria-label="Hide ${first.name}"]`)!;
  eye.focus();
  expect(document.activeElement).toBe(eye);

  // Every worker message clones layer records, including unchanged layers.
  setState({
    ...initial,
    revision: initial.revision + 1,
    layers: initial.layers.map((item) => ({ ...item, ...(item.id === first.id ? { visible: false } : {}) }))
  });
  flush();
  expect(host.querySelector(`[aria-label="Show ${first.name}"]`)).toBe(eye);
  expect(document.activeElement).toBe(eye);
  eye.click();
  expect(layer).toHaveBeenLastCalledWith({ type: 'update', id: first.id, patch: { visible: true } });

  setState((previous) => ({
    ...previous,
    revision: previous.revision + 1,
    activeId: first.id,
    layers: [...previous.layers].reverse().map((item) => ({ ...item }))
  }));
  flush();
  expect(host.querySelector(`.${styles.layerEye}`)).toBe(eye);
  expect(eye.closest(`.${styles.layer}`)?.classList.contains(styles.selected!)).toBe(true);
  const select = host.querySelector<HTMLButtonElement>(`[aria-label="Select ${first.name}"]`)!;
  select.click();
  expect(layer).toHaveBeenLastCalledWith({ type: 'select', id: first.id });
});

it('ignores an empty opacity entry instead of hiding the layer', () => {
  const initial = createDocument().state();
  const layer = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <LayersPanel state={initial} ready onAction={layer} />, host);
  flush();

  const opacity = host.querySelector<HTMLInputElement>('[aria-label="Layer opacity"]')!;
  opacity.value = '';
  opacity.dispatchEvent(new Event('change', { bubbles: true }));
  expect(layer).not.toHaveBeenCalled();
  expect(opacity.value).toBe('100');

  opacity.value = '140';
  opacity.dispatchEvent(new Event('change', { bubbles: true }));
  expect(layer).toHaveBeenLastCalledWith({ type: 'update', id: initial.activeId, patch: { opacity: 1 } });
});

it('renames and duplicates the selected layer, and disables moves past either end', () => {
  const drawing = createDocument();
  drawing.changeLayer({ type: 'add' });
  const [state, setState] = createSignal(drawing.state());
  const layer = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <LayersPanel state={state()} ready onAction={layer} />, host);
  flush();
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

  // The added layer is selected and on top.
  expect(button('Move layer up').disabled).toBe(true);
  expect(button('Move layer down').disabled).toBe(false);
  setState((previous) => ({ ...previous, activeId: previous.layers[0]!.id }));
  flush();
  expect(button('Move layer up').disabled).toBe(false);
  expect(button('Move layer down').disabled).toBe(true);

  const name = host.querySelector<HTMLInputElement>('[aria-label="Layer name"]')!;
  expect(name.value).toBe('Layer 1');
  name.value = '  Sketch ';
  name.dispatchEvent(new Event('change', { bubbles: true }));
  expect(layer).toHaveBeenLastCalledWith({ type: 'update', id: state().activeId, patch: { name: 'Sketch' } });
  layer.mockClear();
  name.value = '   ';
  name.dispatchEvent(new Event('change', { bubbles: true }));
  expect(layer).not.toHaveBeenCalled();
  expect(name.value).toBe('Layer 1');

  button('Duplicate layer').click();
  expect(layer).toHaveBeenLastCalledWith({ type: 'duplicate', id: state().activeId });
});
