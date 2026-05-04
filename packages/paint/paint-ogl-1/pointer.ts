import { createRaycast } from '@app-game/math-examples/raycast';
import { Camera, OGLRenderingContext } from '@app-game/ogl';
import { Vec2 } from '@app-game/ogl/math/vec-2_old';
import { mouseNormalize } from './mouse-normalize';

export const createPointer = (props: { gl: OGLRenderingContext; camera: Camera }) => {
  const mouse = new Vec2();

  const raycast = createRaycast({ camera: props.camera, plane: [0, 0, 1] });

  const getPos = (event: PointerEvent) => {
    const intersectPoint = raycast.cast(mouseNormalize(event, props.gl.canvas));
    if (intersectPoint) {
      mouse.set(intersectPoint.x, intersectPoint.y);
      return intersectPoint;
    }

    return undefined;
  };

  return { getPos };
};
