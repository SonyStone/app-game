// @vitest-environment jsdom
import { createDocument, type LayerAction } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { LayerList } from './LayerControls';

it('scrolls the active row after selection or order changes, without reacting to unrelated reports', () => {
  const doc = createDocument();
  const [state, setState] = createSignal(doc.state());
  const scroll = vi.fn();
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scroll;
  const host = document.createElement('div');
  document.body.append(host);
  const action = (action: LayerAction) => {
    doc.changeLayer(action);
    setState(doc.state());
    flush();
  };
  const dispose = render(() => <LayerList state={state()} ready onAction={action} />, host);
  try {
    flush();
    scroll.mockClear();
    action({ type: 'add' });
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' });
    expect(scroll.mock.instances[0]).toBe(host.querySelector('[aria-current="true"]')!.parentElement);
    scroll.mockClear();
    action({ type: 'update', id: state().activeId, patch: { opacity: 0.4, name: 'Renamed' } });
    expect(scroll).not.toHaveBeenCalled();
    host.firstElementChild!.dispatchEvent(new Event('scroll'));
    setState(doc.state());
    flush();
    expect(scroll).not.toHaveBeenCalled();
    action({ type: 'select', id: 'layer-1' });
    expect(scroll).toHaveBeenCalledTimes(1);
    action({ type: 'move', id: 'layer-1', direction: 1 });
    expect(scroll).toHaveBeenCalledTimes(2);
    action({ type: 'duplicate', id: 'layer-1' });
    expect(scroll).toHaveBeenCalledTimes(3);
    action({ type: 'delete', id: state().activeId });
    expect(scroll).toHaveBeenCalledTimes(4);
  } finally {
    dispose();
    flush();
    host.remove();
    Element.prototype.scrollIntoView = original;
  }
});
