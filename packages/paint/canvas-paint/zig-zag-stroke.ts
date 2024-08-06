import { Vec2Tuple } from '@packages/math';
import { OGLRenderingContext } from '@packages/ogl';
import { curve } from '../brush-example/utils/curve';
import { cavasPointToPoint } from './utils-point-position';

export const createZigZagPoints = (size: [width: number, height: number]) => {
  const inPoints = [
    [-0.9, -0.9],
    [2.9, -0.9],
    [-2.9, 0.9],
    [0.9, 0.9]
  ] as [number, number][];

  const outPoints = [];
  let num = 100;
  for (let p = 0, i = 0; p <= 1; p = p + 1 / num, i++) {
    const point = curve(p, inPoints[0] ?? 0, inPoints[1] ?? 0, inPoints[2] ?? 0, inPoints[3] ?? 0);
    outPoints.push(cavasPointToPoint(point, size[0], size[1]));
  }

  return outPoints;
};

/**
 * Zig-zag stroke
 */
export const drawTestZigZagStrokePoints = (
  gl: OGLRenderingContext,
  brush: { add: (point: Vec2Tuple, opacity: number) => void; apply: () => void }
) => {
  const points = createZigZagPoints([gl.canvas.clientWidth, gl.canvas.clientHeight]);
  for (const [index, point] of points.entries()) {
    brush.add(point, index / points.length);
  }
  brush.apply();
};
