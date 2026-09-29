import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import type { TextDocument } from '../document/document';
import { createDocumentCamera, pageAspectOf } from './createDocumentCamera';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('fits pages on request, resetting rotation, and follows the pages passed to each call', () => {
  const camera = mount();
  const size = { width: 800, height: 600 };

  camera.fitToPages(scene().pages, size);
  flush();
  const firstFit = camera.camera();
  expect(firstFit.rotation).toBe(0);

  camera.setCamera({ ...firstFit, zoom: 100, rotation: 1 });
  camera.fitToPages(scene().pages, size);
  flush();
  expect(camera.camera()).toEqual(firstFit);

  camera.fitToPages([...scene().pages, { ...scene().pages[0]!, x: -1 }], size);
  flush();
  expect(camera.camera().zoom).not.toBe(firstFit.zoom);
});

it('resets to the initial view when resetOn changes, but keeps edits when only the page aspect changes', () => {
  const [document, setDocument] = createSignal(scene());
  const [aspect, setAspect] = createSignal(612 / 792);
  const camera = mount({ pageAspect: aspect, resetOn: document });
  const initial = camera.camera();

  camera.setCamera({ x: 3, y: 4, zoom: 0.25, rotation: 1 });
  flush();
  setAspect(1);
  flush();
  expect(camera.camera()).toEqual({ x: 3, y: 4, zoom: 0.25, rotation: 1 });
  expect(camera.pageAspect()).toBe(1);

  setDocument(scene());
  flush();
  expect(camera.camera()).toEqual(initial);
});

it('derives the page aspect from the first page, or 1 without a document', () => {
  expect(pageAspectOf(scene())).toBe(612 / 792);
  expect(pageAspectOf(undefined)).toBe(1);
});

function mount(options: Parameters<typeof createDocumentCamera>[0] = { pageAspect: () => 612 / 792 }) {
  return createRoot((dispose) => {
    cleanups.push(dispose);
    return createDocumentCamera(options);
  });
}

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
