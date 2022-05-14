export interface ProgramInfo {
  /** A shader program */
  program: WebGLProgram;

  /** object of setters as returned from createUniformSetters, */
  uniformSetters: { [key: string]: () => void };

  /** object of setters as returned from createAttribSetters, */
  attribSetters: { [key: string]: () => void };

  /** a uniform block spec for making UniformBlockInfos with createUniformBlockInfo etc.. */
  uniformBlockSpec?: UniformBlockSpec;

  /** info for transform feedbacks */
  transformFeedbackInfo?: { [key: string]: TransformFeedbackInfo };
}

/**
 * A `UniformBlockSpec` represents the data needed to create and bind
 * UniformBlockObjects for a given program
 */
export interface UniformBlockSpec {
  /** The BlockSpec for each block by block name */
  blockSpecs: { [key: string]: BlockSpec };

  /** An array of data for each uniform by uniform index. */
  uniformData: UniformData[];
}

/** The specification for one UniformBlockObject */
export interface BlockSpec {
  /** The index of the block. */
  index: number;

  /** The size in bytes needed for the block */
  size: number;

  /**
   * The indices of the uniforms used by the block. These indices
   * correspond to entries in a UniformData array in the {@link UniformBlockSpec}.
   **/
  uniformIndices: number[];

  /** Self explanatory */
  usedByVertexShader: boolean;

  /** Self explanatory */
  usedByFragmentShader: boolean;

  /** Self explanatory */
  used: boolean;
}

export interface UniformData {
  /** The name of the uniform */
  name: string;

  /** The WebGL type enum for this uniform */
  type: number;

  /** The number of elements for this uniform */
  size: number;

  /** The block index this uniform appears in */
  blockNdx: number;

  /** The byte offset in the block for this uniform's value */
  offset: number;
}

export interface TransformFeedbackInfo {
  /** index of transform feedback */
  index: number;

  /** GL type */ // ?? version or what?
  type: number;

  /** 1 - 4 */
  size: number;
}
