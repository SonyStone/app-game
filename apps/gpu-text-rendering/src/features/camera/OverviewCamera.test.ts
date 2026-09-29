import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { TextDocument } from '../document/document';
import { OverviewCamera, type OverviewCameraRef } from './OverviewCamera';

vi.mock('./DocumentCamera', () => ({ useDocumentCamera: () => camera }));
vi.mock('../viewport/Viewport', () => ({
  useViewport: () => ({ size: () => ({ css: { width: 800, height: 600 } }) })
}));
vi.mock('../scene/FrameLoop', () => ({ useFrameLoop: () => ({ invalidate }) }));
const camera = { x: 0.5, y: 0.5, zoom: 2, rotation: 0 };
const invalidate = vi.fn();
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  invalidate.mockClear();
});

it('fits on direct calls and reads the current document without fitting automatically', () => {
  let cameraRef: OverviewCameraRef | undefined;
  const setDocument = createRoot((dispose) => {
    cleanups.push(dispose);
    const [document, setDocument] = createSignal(scene());
    OverviewCamera({
      get document() {
        return document();
      },
      ref: (ref) => {
        cameraRef = ref;
      }
    });
    return setDocument;
  });
  flush();
  expect(invalidate).not.toHaveBeenCalled();
  cameraRef!.fitToDocument();
  const firstFit = camera.zoom;
  camera.zoom = 100;
  cameraRef!.fitToDocument();
  expect(camera.zoom).toBe(firstFit);
  expect(invalidate).toHaveBeenCalledTimes(2);
  setDocument({ ...scene(), pages: [{ ...scene().pages[0]!, height: 1584 }] });
  flush();
  expect(invalidate).toHaveBeenCalledTimes(2);
  cameraRef!.fitToDocument();
  expect(camera.zoom).not.toBe(firstFit);
});

it('clears the previous ref callback on replacement and the current callback on unmount', () => {
  const first = vi.fn<(ref?: OverviewCameraRef) => void>();
  const second = vi.fn<(ref?: OverviewCameraRef) => void>();
  const { setReceiver, unmount } = createRoot((dispose) => {
    cleanups.push(dispose);
    const [receiver, setReceiver] = createSignal({ ref: first });
    OverviewCamera({
      document: scene(),
      get ref() {
        return receiver().ref;
      }
    });
    return { setReceiver, unmount: dispose };
  });
  flush();
  expect(first).toHaveBeenLastCalledWith({ fitToDocument: expect.any(Function) });
  setReceiver({ ref: second });
  flush();
  expect(first).toHaveBeenLastCalledWith(undefined);
  expect(second).toHaveBeenLastCalledWith({ fitToDocument: expect.any(Function) });
  unmount();
  expect(second).toHaveBeenLastCalledWith(undefined);
});

function scene(): TextDocument {
  return {
    kind: 'glyphs',
    pages: [{ width: 612, height: 792, x: 0, y: 0, beginVertex: 0, endVertex: 6 }],
    positions: { x: new Float32Array(), y: new Float32Array() },
    glyphVertices: new ArrayBuffer(0),
    atlas: { buf: new ArrayBuffer(0), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(0), width: 1, height: 1 }
  };
}
