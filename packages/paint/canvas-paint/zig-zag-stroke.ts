import { Vec2 } from '@app-game/math';
import { OGLRenderingContext } from '@app-game/ogl';
import { curve } from '../brush-example/utils/curve';
import { cavasPointToPoint } from './utils-point-position';

export const createZigZagPoints = (size: [width: number, height: number]) => {
  const inPoints = [
    new Vec2().set(-0.9, -0.9),
    new Vec2().set(2.9, -0.9),
    new Vec2().set(-2.9, 0.9),
    new Vec2().set(0.9, 0.9)
  ] as Vec2[];

  const outPoints: Vec2[] = [];
  const num = 100;
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
  brush: { add: (point: Vec2, opacity: number) => void; end: () => void }
) => {
  const points = createZigZagPoints([gl.canvas.clientWidth, gl.canvas.clientHeight]);
  for (const [index, point] of points.entries()) {
    brush.add(point, index / points.length);
  }
  brush.end();
};
