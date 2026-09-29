import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentLayer } from './DocumentLayer';
import { useDocumentRenderer } from './DocumentRendererProvider';

vi.mock('./DocumentRendererProvider', () => ({ useDocumentRenderer: vi.fn() }));
vi.mock('../../camera/DocumentCamera', () => ({
  useDocumentCamera: () => ({ camera: () => ({ x: 0, y: 0, zoom: 1, rotation: 0 }) })
}));
vi.mock('../../scene/FrameLoop', () => ({ useFrameLoop: () => ({ invalidate: vi.fn() }) }));
vi.mock('../../viewport/Viewport', () => ({ useViewport: () => ({ size: () => ({ css: { width: 1, height: 1 } }) }) }));

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('rejects a second layer on one renderer and allows a replacement after removal', () => {
  const value = { document: {}, renderer: { events: new EventTarget() } };
  vi.mocked(useDocumentRenderer).mockReturnValue(value as unknown as ReturnType<typeof useDocumentRenderer>);
  const first = mount();
  expect(mount).toThrow('Only one DocumentLayer');
  first();
  expect(mount).not.toThrow();

  function mount() {
    return createRoot((dispose) => {
      cleanups.push(dispose);
      DocumentLayer({});
      return dispose;
    });
  }
});
