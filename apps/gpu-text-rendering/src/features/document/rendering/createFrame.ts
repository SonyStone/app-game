import { rotationMatrix, type Camera } from '../../camera/camera';
import type { TextDocument } from '../document';

/** Transforms, visible pages and drawing options for one frame. */
export type SceneFrame = ReturnType<typeof createFrame>;

/** Creates page transforms and culls rotated pages. CSS display size keeps overlays aligned at fractional DPR. */
export function createFrame(
  document: TextDocument,
  camera: Camera,
  width: number,
  height: number,
  vectorOnly = false,
  grids = false,
  displaySize = { width, height }
) {
  const aspect = displaySize.height / displaySize.width;
  const zoomY = (camera.zoom * document.pages[0]!.width) / document.pages[0]!.height;
  const mul: [number, number] = [aspect / camera.zoom, 1 / zoomY];
  const add: [number, number] = [-camera.x * mul[0], -camera.y * mul[1]];
  const rotation = rotationMatrix(camera.rotation, aspect);

  const visible = document.pages.flatMap((page, index) => {
    const offset: [number, number] = [add[0] - page.x * mul[0], add[1] - page.y * mul[1]];
    const w = page.width / document.pages[0]!.width;
    const h = page.height / document.pages[0]!.height;

    const corners = [
      [0, 1 - h],
      [w, 1 - h],
      [0, 1],
      [w, 1]
    ].map(([x, y]) => {
      const px = x! * mul[0] + offset[0],
        py = y! * mul[1] + offset[1];

      return [rotation[0]! * px + rotation[2]! * py, rotation[1]! * px + rotation[3]! * py];
    });

    if (
      Math.max(...corners.map((p) => p[0]!)) < -1 ||
      Math.min(...corners.map((p) => p[0]!)) > 1 ||
      Math.max(...corners.map((p) => p[1]!)) < -1 ||
      Math.min(...corners.map((p) => p[1]!)) > 1
    ) {
      return [];
    }

    return [{ index, page }];
  });

  return { width, height, mul, add, rotation, visible, vectorOnly, grids };
}
