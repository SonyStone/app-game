import type { SceneFrame } from '../createFrame';
import type { PixelRect } from './paintBounds';

/** Preserves physical pixel positions and AA footprints when rendering into a cropped scratch texture. */
export function croppedView(frame: SceneFrame, rect: PixelRect, width: number, height: number) {
  const [a, b, c, d] = frame.rotation;
  const sx = frame.width / width;
  const sy = frame.height / height;
  const tx = (frame.width - 2 * rect.x - width) / width;
  const ty = (height - frame.height + 2 * rect.y) / height;
  const determinant = (a! * d! - b! * c!) * sx * sy;

  return {
    mul: frame.mul,
    add: [
      frame.add[0] + (d! * sy * tx - c! * sx * ty) / determinant,
      frame.add[1] + (a! * sx * ty - b! * sy * tx) / determinant
    ] as [number, number],
    rotation: [a! * sx, b! * sy, c! * sx, d! * sy] as [number, number, number, number],
    rasterTexel: [2 / width, 2 / height] as [number, number],
    debug: 0,
    vectorOnly: frame.vectorOnly ? 1 : 0
  };
}
