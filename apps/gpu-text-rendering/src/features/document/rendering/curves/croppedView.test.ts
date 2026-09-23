import { expect, it } from 'vitest';
import type { SceneFrame } from '../createFrame';
import { croppedView } from './croppedView';

it('preserves subpixel positions for rotated, non-square, offset crops', () => {
  const frame: SceneFrame = {
    width: 1920,
    height: 1200,
    mul: [3, 7],
    add: [-4, 2],
    rotation: [0.8, 0.96, -0.375, 0.8],
    visible: [],
    vectorOnly: false,
    grids: false
  };
  const rect = { x: 187, y: 62, width: 377, height: 182 };
  const crop = croppedView(frame, rect, 384, 192);
  const project = (
    view: Pick<SceneFrame, 'mul' | 'add' | 'rotation'>,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const px = x * view.mul[0] + view.add[0];
    const py = y * view.mul[1] + view.add[1];
    const [a, b, c, d] = view.rotation;
    return [((a! * px + c! * py + 1) * width) / 2, ((1 - b! * px - d! * py) * height) / 2];
  };

  for (const [x, y] of [
    [0, 0],
    [1.2345, -0.4321],
    [0.5, 0.5]
  ]) {
    const original = project(frame, x!, y!, frame.width, frame.height);
    const cropped = project(crop, x!, y!, 384, 192);
    expect(cropped[0]! + rect.x).toBeCloseTo(original[0]!, 8);
    expect(cropped[1]! + rect.y).toBeCloseTo(original[1]!, 8);
  }
});
