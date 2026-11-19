import { expect, it } from 'vitest';
import { joinedDuration, joinedEasing, joinedOutline, joinedShape, mixFrames } from './createJoinedSelection';

const metrics = { radius: 9, join: 12 };
const row = { height: 40, left: 8, right: 300 };

it('gives a row with room around it full concave corners, as one after a group heading', () => {
  // A heading 28 px tall lies between the content's top and the first row.
  expect(joinedShape({ ...row, top: 30 }, 400, metrics)).toEqual({
    ...row,
    top: 30,
    radius: 9,
    before: 12,
    after: 12
  });
});

it('curves a first or last row only as far as the content reaches, down to a straight edge', () => {
  expect(joinedShape({ ...row, top: 5 }, 400, metrics).before).toBe(5);
  expect(joinedShape({ ...row, top: 0 }, 400, metrics).before).toBe(0);
  expect(joinedShape({ ...row, top: 352 }, 400, metrics).after).toBe(8);
  expect(joinedShape({ ...row, top: 360 }, 400, metrics).after).toBe(0);
  // The list's own padding under the last row leaves room for the whole corner.
  expect(joinedShape({ ...row, top: 332 }, 400, metrics).after).toBe(12);
});

it('keeps the outer corners within half the row', () => {
  expect(joinedShape({ ...row, top: 30, height: 12 }, 400, metrics).radius).toBe(6);
});

it('outlines the row with convex outer corners and concave corners into the surface, open along it', () => {
  const { fill, edge } = joinedOutline(joinedShape({ ...row, top: 30 }, 400, metrics));
  expect(edge).toBe('M300 -12 A12 12 0 0 1 288 0 H17 A9 9 0 0 0 8 9 V31 A9 9 0 0 0 17 40 H288 A12 12 0 0 1 300 52');
  // The fill closes past the edge, where the list clips it against the surface.
  expect(fill).toBe(`${edge} H302 V-12 Z`);
});

it('travels with the reference tabs’ timing: 200 ms, a short start and a long arrival', () => {
  expect(joinedDuration).toBe(200);
  // The share of the travel covered at each 60 Hz frame of the reference's 1× transition, measured from its pixels.
  const measured = [0.037, 0.243, 0.534, 0.699, 0.801, 0.872, 0.919, 0.953, 0.974, 0.99, 0.997, 1];
  measured.forEach((share, frame) => {
    expect(joinedEasing(((frame + 1) * 1000) / 60 / joinedDuration)).toBeCloseTo(share, 1);
  });
  expect(joinedEasing(0)).toBe(0);
  expect(joinedEasing(1)).toBe(1);
});

it('re-forms the corners on the way, field by field', () => {
  const from = joinedShape({ ...row, top: 0 }, 400, metrics);
  const to = joinedShape({ ...row, top: 100 }, 400, metrics);
  expect(mixFrames(from, to, 0.5)).toMatchObject({ top: 50, before: 6, after: 12 });
});
