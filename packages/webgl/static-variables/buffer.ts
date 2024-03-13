import { GL_CONST } from './static-variables';

export const enum GL_BUFFER_TARGET {
  /**
   * buffer type for using attribute data
   *
   * Buffer containing vertex attributes, such as vertex coordinates, texture coordinate data, or vertex color data.
   */
  ARRAY_BUFFER = GL_CONST.ARRAY_BUFFER,

  /**
   * buffer type for using as an index buffer
   *
   * Buffer used for element indices.
   */
  ELEMENT_ARRAY_BUFFER = GL_CONST.ELEMENT_ARRAY_BUFFER,

  // --- When using a WebGL 2 context, the following values are available additionally:
  /**
   * Buffer for copying from one buffer object to another.
   */
  COPY_READ_BUFFER = GL_CONST.COPY_READ_BUFFER,

  /**
   * Buffer for copying from one buffer object to another.
   */
  COPY_WRITE_BUFFER = GL_CONST.COPY_WRITE_BUFFER,

  /**
   * Buffer for transform feedback operations.
   */
  TRANSFORM_FEEDBACK_BUFFER = GL_CONST.TRANSFORM_FEEDBACK_BUFFER,

  /**
   * the buffer type is for uniform buffer objects
   *
   * Buffer used for storing uniform blocks.
   */
  UNIFORM_BUFFER = GL_CONST.UNIFORM_BUFFER,

  /**
   * Buffer used for pixel transfer operations.
   */
  PIXEL_PACK_BUFFER = GL_CONST.PIXEL_PACK_BUFFER,

  /**
   * Buffer used for pixel transfer operations.
   */
  PIXEL_UNPACK_BUFFER = GL_CONST.PIXEL_UNPACK_BUFFER
}
