import { GL_CONST } from './static-variables';

export const enum GL_PROGRAM_PARAMETER {
  /** Returns a `GLboolean` indicating whether or not the program is flagged for deletion. */
  DELETE_STATUS = GL_CONST.DELETE_STATUS,

  /** Returns a `GLboolean` indicating whether or not the last link operation was successful. */
  LINK_STATUS = GL_CONST.LINK_STATUS,

  /** Returns a `GLboolean` indicating whether or not the last validation operation was successful. */
  VALIDATE_STATUS = GL_CONST.VALIDATE_STATUS,

  /** Returns a `GLint` indicating the number of attached shaders to a program. */
  ATTACHED_SHADERS = GL_CONST.ATTACHED_SHADERS,

  /** Returns a `GLint` indicating the number of active attribute variables to a program. */
  ACTIVE_ATTRIBUTES = GL_CONST.ACTIVE_ATTRIBUTES,

  /** Returns a GLint indicating the number of active uniform variables to a program. */
  ACTIVE_UNIFORMS = GL_CONST.ACTIVE_UNIFORMS,

  // When using a WebGL 2 context, the following values are available additionally:

  /** Returns a `GLenum` indicating the buffer mode when transform feedback is active. May be `SEPARATE_ATTRIBS` or `INTERLEAVED_ATTRIBS.` */
  TRANSFORM_FEEDBACK_BUFFER_MODE = GL_CONST.TRANSFORM_FEEDBACK_BUFFER_MODE,

  /** Returns a `GLint` indicating the number of varying variables to capture in transform feedback mode. */
  TRANSFORM_FEEDBACK_VARYINGS = GL_CONST.TRANSFORM_FEEDBACK_VARYINGS,

  /** Returns a `GLint` indicating the number of uniform blocks containing active uniforms. */
  ACTIVE_UNIFORM_BLOCKS = GL_CONST.ACTIVE_UNIFORM_BLOCKS
}
