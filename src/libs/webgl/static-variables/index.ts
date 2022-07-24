import { GL_BUFFER_TYPE } from './buffer';
import { GL_DATA_TYPE } from './data-type';
import { GL_PROGRAM_PARAMETER } from './program-parameter';
import { GL_STATIC_VARIABLES } from './static-variables';
import { GL_TEXTURES } from './textures';

export {
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
  GL_DATA_TYPE,
  GL_PROGRAM_PARAMETER,
  GL_BUFFER_TYPE,
};

/**
 * A GLbitfield bitwise OR mask that indicates the buffers to be cleared. Possible values are:
 */
export enum GL_CLEAR_MASK {
  /** mask that indicates the buffers to be cleared */
  COLOR_BUFFER_BIT = GL_STATIC_VARIABLES.COLOR_BUFFER_BIT,
  /** mask that indicates the buffers to be cleared */
  DEPTH_BUFFER_BIT = GL_STATIC_VARIABLES.DEPTH_BUFFER_BIT,
  /** mask that indicates the buffers to be cleared */
  STENCIL_BUFFER_BIT = GL_STATIC_VARIABLES.STENCIL_BUFFER_BIT,
}

export enum GL_DRAW_ARRAYS_MODE {
  /** Draws a single dot. */
  POINTS = GL_STATIC_VARIABLES.POINTS,

  /** Draws a straight line to the next vertex. */
  LINE_STRIP = GL_STATIC_VARIABLES.LINE_STRIP,

  /** Draws a straight line to the next vertex, and connects the last vertex back to the first. */
  LINE_LOOP = GL_STATIC_VARIABLES.LINE_LOOP,

  /** Draws a line between a pair of vertices. */
  LINES = GL_STATIC_VARIABLES.LINES,
  TRIANGLE_STRIP = GL_STATIC_VARIABLES.TRIANGLE_STRIP,
  TRIANGLE_FAN = GL_STATIC_VARIABLES.TRIANGLE_FAN,

  /** Draws a triangle for a group of three vertices. */
  TRIANGLES = GL_STATIC_VARIABLES.TRIANGLES,
}

export enum GL_SHADER_TYPE {
  /**
   * vertex shader
   */
  VERTEX_SHADER = GL_STATIC_VARIABLES.VERTEX_SHADER,

  /**
   * fragment shader
   */
  FRAGMENT_SHADER = GL_STATIC_VARIABLES.FRAGMENT_SHADER,
}

export enum GL_BUFFER_USAGE {
  STATIC_DRAW = GL_STATIC_VARIABLES.STATIC_DRAW,
  DYNAMIC_DRAW = GL_STATIC_VARIABLES.DYNAMIC_DRAW,
}

export enum GL_DRAW_ELEMENTS_TYPE {
  UNSIGNED_SHORT = GL_STATIC_VARIABLES.UNSIGNED_SHORT,
  UNSIGNED_INT = GL_STATIC_VARIABLES.UNSIGNED_INT,
}
