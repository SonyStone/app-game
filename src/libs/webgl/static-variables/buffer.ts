import { GL_STATIC_VARIABLES } from './static-variables';

export enum GL_BUFFER_TYPE {
  /**
   * buffer type for using attribute data
   *
   * Buffer containing vertex attributes, such as vertex coordinates, texture coordinate data, or vertex color data.
   */
  ARRAY_BUFFER = GL_STATIC_VARIABLES.ARRAY_BUFFER,

  /**
   * buffer type for using as an index buffer
   *
   * Buffer used for element indices.
   */
  ELEMENT_ARRAY_BUFFER = GL_STATIC_VARIABLES.ELEMENT_ARRAY_BUFFER,

  // --- When using a WebGL 2 context, the following values are available additionally:
  /**
   * Buffer for copying from one buffer object to another.
   */
  COPY_READ_BUFFER = GL_STATIC_VARIABLES.COPY_READ_BUFFER,

  /**
   * Buffer for copying from one buffer object to another.
   */
  COPY_WRITE_BUFFER = GL_STATIC_VARIABLES.COPY_WRITE_BUFFER,

  /**
   * Buffer for transform feedback operations.
   */
  TRANSFORM_FEEDBACK_BUFFER = GL_STATIC_VARIABLES.TRANSFORM_FEEDBACK_BUFFER,

  /**
   * the buffer type is for uniform buffer objects
   *
   * Buffer used for storing uniform blocks.
   */
  UNIFORM_BUFFER = GL_STATIC_VARIABLES.UNIFORM_BUFFER,

  /**
   * Buffer used for pixel transfer operations.
   */
  PIXEL_PACK_BUFFER = GL_STATIC_VARIABLES.PIXEL_PACK_BUFFER,

  /**
   * Buffer used for pixel transfer operations.
   */
  PIXEL_UNPACK_BUFFER = GL_STATIC_VARIABLES.PIXEL_UNPACK_BUFFER,
}
