import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import { isBuiltIn } from './isBuiltIn';

export function createUniformBlockSetters(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const numUniformBlocks = gl.getProgramParameter(program, GL_CONST.ACTIVE_UNIFORM_BLOCKS);
  console.log('numUniformBlocks', numUniformBlocks);
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  console.log('numUniforms', numUniforms, [...Array(numUniforms).keys()]);
  console.log('ACTIVE_ATTRIBUTES', gl.getProgramParameter(program, GL_CONST.ACTIVE_ATTRIBUTES));
  console.log('ATTACHED_SHADERS', gl.getProgramParameter(program, GL_CONST.ATTACHED_SHADERS));

  // mine
  for (let uniformIndex = 0; uniformIndex < numUniformBlocks; ++uniformIndex) {
    const name = gl.getActiveUniformBlockName(program, uniformIndex)!;
    const size = gl.getActiveUniformBlockParameter(program, uniformIndex, GL_CONST.UNIFORM_BLOCK_DATA_SIZE);

    console.log('uniformBlockInfo', uniformIndex, name, size);
  }

  // how to get all uniformblocks
  {
    const indices = [...Array(numUniforms).keys()];
    const blockIndices = gl.getActiveUniforms(program, indices, gl.UNIFORM_BLOCK_INDEX) as number[];
    const offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET) as number[];

    const uniformsBlocks = [];

    console.log('blockIndices', indices, blockIndices, offsets);

    for (let ii = 0; ii < numUniforms; ++ii) {
      const uniformInfo = gl.getActiveUniform(program, ii)!;
      if (isBuiltIn(uniformInfo)) {
        continue;
      }
      const { name, type, size } = uniformInfo;
      const blockIndex = blockIndices[ii];
      const offset = offsets[ii];
      console.log(`❓uniform: `, name, size, glEnumToString(gl, type), blockIndex, offset);
    }
  }

  // twgl
  {
    const blockSpecs: Record<string, any> = {};
    for (let ii = 0; ii < numUniformBlocks; ++ii) {
      const name = gl.getActiveUniformBlockName(program, ii)!;
      const blockSpec = {
        index: gl.getUniformBlockIndex(program, name),
        usedByVertexShader: gl.getActiveUniformBlockParameter(
          program,
          ii,
          GL_CONST.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER
        ),
        usedByFragmentShader: gl.getActiveUniformBlockParameter(
          program,
          ii,
          GL_CONST.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER
        ),
        size: gl.getActiveUniformBlockParameter(program, ii, GL_CONST.UNIFORM_BLOCK_DATA_SIZE),
        uniformIndices: gl.getActiveUniformBlockParameter(program, ii, GL_CONST.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES),
        used: false
      };
      blockSpec.used = blockSpec.usedByVertexShader || blockSpec.usedByFragmentShader;
      blockSpecs[name] = blockSpec;
    }

    console.log('blockSpecs', blockSpecs);
  }
}

function glEnumToString(gl: WebGL2RenderingContext, value: number) {
  const keys = [];
  for (const key in gl) {
    if ((gl as any)[key] === value) {
      keys.push(key);
    }
  }
  return keys.length ? keys.join(' | ') : `0x${value.toString(16)}`;
}
