import { DRAW_MODES } from 'pixi.js';
import { Geometry } from './geometry';

/**
 * Draws the currently bound geometry.
 *
 * @param type - The type primitive to render.
 * @param size - The number of elements to be rendered. If not specified, all vertices after the
 *  starting vertex will be drawn.
 * @param start - The starting vertex in the geometry to start drawing from. If not specified,
 *  drawing will start from the first vertex.
 * @param instanceCount - The number of instances of the set of elements to execute. If not specified,
 *  all instances will be drawn.
 */
export function draw(
  gl: WebGL2RenderingContext,
  type: DRAW_MODES,
  geometry: Geometry,
  start = 0,
  instanceCount = 1
) {
  if (geometry.indexBuffer) {
    const { length, type: glType, byteSize } = geometry.indexBuffer;
    if (geometry.instanced) {
      gl.drawElementsInstanced(
        type,
        length,
        glType,
        start * byteSize,
        instanceCount
      );
    } else {
      gl.drawElements(type, length, glType, start * byteSize);
    }
  } else if (geometry.instanced) {
    gl.drawArraysInstanced(type, start, geometry.getSize(), instanceCount || 1);
  } else {
    gl.drawArrays(type, start, geometry.getSize());
  }
}
