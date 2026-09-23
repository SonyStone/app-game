import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../camera/camera';
import { layoutPages, pageVertices, type TextDocument } from './document';
import { createFrame } from './rendering/createFrame';

function documentFixture(): TextDocument {
  return {
    pages: layoutPages([{ width: 612, height: 792, beginVertex: 0, endVertex: 12, images: [] }], 2)._unsafeUnwrap(),
    kind: 'glyphs',
    glyphVertices: new ArrayBuffer(144),
    positions: { x: new Float32Array(2), y: new Float32Array(2) },
    atlas: { buf: new ArrayBuffer(4), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 },
    imageVertices: new ArrayBuffer(0),
    images: new Map()
  };
}

describe('renderer-independent document data', () => {
  it('keeps page placement finite even in a very narrow viewport', () => {
    const pages = layoutPages(documentFixture().pages, 0.001)._unsafeUnwrap();
    expect(pages[0]!.x).toBe(-0);
    expect(pages[0]!.y).toBe(0);
    expect([...pageVertices(documentFixture())]).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('culls using rotated page bounds, retaining a page brought into view by rotation', () => {
    const document = documentFixture();
    const camera = { x: 0.5, y: -0.2, zoom: 0.2, rotation: 0 };
    expect(createFrame(document, camera, 1200, 800).visible).toHaveLength(0);
    expect(createFrame(document, { ...camera, rotation: Math.PI / 2 }, 1200, 800).visible).toHaveLength(1);
  });
});

it('aligns document projection with CSS-space overlays at fractional DPR', () => {
  const document = documentFixture();
  const camera = { x: 0.3, y: 0.8, zoom: 0.2, rotation: 0.7 };
  const display = { width: 800.5, height: 600.5 };
  const frame = createFrame(document, camera, 1001, 751, false, false, display);
  const point = { x: 0.4, y: 0.7 };
  const screen = worldToScreen(camera, point, display.width, display.height, 612 / 792);
  const x = point.x * frame.mul[0] + frame.add[0];
  const y = point.y * frame.mul[1] + frame.add[1];

  expect(frame.rotation[0] * x + frame.rotation[2] * y).toBeCloseTo((screen.x * 2) / display.width - 1, 12);
  expect(frame.rotation[1] * x + frame.rotation[3] * y).toBeCloseTo(1 - (screen.y * 2) / display.height, 12);
  expect([frame.width, frame.height]).toEqual([1001, 751]);
});

it('leaves space for larger pages in mixed-size PDF documents', () => {
  const metadata = [
    { width: 100, height: 100 },
    { width: 200, height: 300 },
    { width: 100, height: 100 },
    { width: 100, height: 100 }
  ].map((size) => ({ ...size, beginVertex: 0, endVertex: 0, images: [] }));
  const pages = layoutPages(metadata, 1)._unsafeUnwrap();

  expect(pages.map(({ x, y }) => [x, y])).toEqual([
    [-0, 0],
    [-1.06, 0],
    [-0, 3.06],
    [-1.06, 3.06]
  ]);
});
