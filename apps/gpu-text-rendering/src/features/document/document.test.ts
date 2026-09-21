import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../camera/camera';
import { decodeGlyphs } from './decodeGlyphs';
import { layoutPages, pageVertices, type TextDocument } from './document';
import { createFrame } from './rendering/createFrame';

function documentFixture(): TextDocument {
  return {
    pages: layoutPages([{ width: 612, height: 792, beginVertex: 0, endVertex: 12, images: [] }], 2)._unsafeUnwrap(),
    glyphVertices: new ArrayBuffer(144),
    positions: { x: new Float32Array(2), y: new Float32Array(2) },
    atlas: { buf: new ArrayBuffer(4), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(72), width: 1, height: 1 },
    imageVertices: new ArrayBuffer(0),
    images: new Map()
  };
}

describe('renderer-independent document data', () => {
  it('decodes position deltas without mutating source bytes and preserves packed corner flags', () => {
    const records = new Int16Array([100, 200, 3, 4, 20, 0, 0, 30, -1, -1, 5, -10, 3, 4, 20, 0, 0, 30, -1, -1]);
    const original = records.slice();
    const result = decodeGlyphs({ buf: records.buffer, width: 1, height: 1 })._unsafeUnwrap();
    const vertices = new Int16Array(result.vertices);
    expect(records).toEqual(original);
    expect(result.vertices.byteLength).toBe(144);
    expect([...vertices.slice(0, 4)]).toEqual([100, 200, 6, 8]);
    expect([...vertices.slice(6, 10)]).toEqual([120, 200, 7, 8]);
    expect([...vertices.slice(36, 40)]).toEqual([105, 190, 6, 8]);
    expect(decodeGlyphs({ buf: records.buffer, width: 1, height: 1 })._unsafeUnwrap().vertices).toEqual(
      result.vertices
    );
  });

  it('rejects incomplete records and accepts empty glyph streams', () => {
    expect(decodeGlyphs({ buf: new ArrayBuffer(21), width: 1, height: 1 })._unsafeUnwrapErr()).toMatchObject({
      kind: 'document',
      code: 'invalid-data'
    });
    expect(decodeGlyphs({ buf: new ArrayBuffer(0), width: 0, height: 0 })._unsafeUnwrap().vertices.byteLength).toBe(0);
  });

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
