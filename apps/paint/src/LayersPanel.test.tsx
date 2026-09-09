import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createDocument } from './document';
import { LayersPanel } from './LayersPanel';

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
  dispose = render(() => <LayersPanel state={state} ready={ready} layer={layer} />, host);
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
  expect(host.querySelector('.paint-layer-eye')).toBe(eye);
  expect(eye.closest('.paint-layer')?.classList.contains('selected')).toBe(true);
  const select = host.querySelector<HTMLButtonElement>(`[aria-label="Select ${first.name}"]`)!;
  select.click();
  expect(layer).toHaveBeenLastCalledWith({ type: 'select', id: first.id });
});
