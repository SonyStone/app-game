// @vitest-environment jsdom
import { createDocument } from '@app-game/paint-core/document';
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { createTestServices } from './testServices';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  document.body.replaceChildren();
  localStorage.clear();
});

it('commits typed and arrow-key opacity immediately, including after a pointer tap', () => {
  const { input, services } = mountOpacity();
  pointer(input, 'pointerdown', 120);
  pointer(input, 'pointerup', 120);
  input.value = '40';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flush();
  expect(services.layers.action).toHaveBeenLastCalledWith({
    type: 'update', id: services.layers.state().activeId, patch: { opacity: 0.4 }
  });
  expect(input.value).toBe('40');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  flush();
  expect(input.value).toBe('39');
  expect(services.layers.action).toHaveBeenCalledTimes(2);
  expect(services.layers.action).toHaveBeenLastCalledWith({
    type: 'update', id: services.layers.state().activeId, patch: { opacity: 0.39 }
  });
});

it('defers scrub commands until release and ignores unchanged or cancelled gestures', () => {
  const { input, services } = mountOpacity();
  pointer(input, 'pointerdown', 120);
  pointer(input, 'pointermove', 60);
  expect(services.layers.action).not.toHaveBeenCalled();
  pointer(input, 'pointerup', 60);
  expect(services.layers.action).toHaveBeenCalledTimes(1);
  expect(input.value).toBe('75');
  vi.mocked(services.layers.action).mockClear();
  pointer(input, 'pointerdown', 120);
  pointer(input, 'pointermove', 60);
  pointer(input, 'pointermove', 120);
  pointer(input, 'pointerup', 120);
  expect(services.layers.action).not.toHaveBeenCalled();
  pointer(input, 'pointerdown', 120);
  pointer(input, 'pointermove', 60);
  pointer(input, 'pointercancel', 60);
  expect(input.value).toBe('75');
  expect(services.layers.action).not.toHaveBeenCalled();
});

/** Mounts the real number part against a reactive document, without engine resources. */
function mountOpacity() {
  const services = createRoot((dispose) => {
    disposers.push(dispose);
    const { services } = createTestServices();
    const doc = createDocument();
    const [state, setState] = createSignal(doc.state());
    services.layers.state = state;
    services.layers.action = vi.fn((action) => {
      doc.changeLayer(action);
      setState(doc.state());
    });
    return services;
  });
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="value:layer-opacity" span={{ columns: 2, rows: 1 }} look="number" />
    </LegoServicesContext>
  ), host));
  flush();
  const input = host.querySelector('input')!;
  input.setPointerCapture = vi.fn();
  input.hasPointerCapture = vi.fn(() => true);
  return { services, input };
}

/** Flushes between real pointer events, preserving Solid 2's event-local write timing. */
function pointer(input: HTMLInputElement, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'pen' } });
  input.dispatchEvent(event);
  flush();
}
