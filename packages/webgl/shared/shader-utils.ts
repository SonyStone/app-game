import {
  GL_BUFFER_TYPE,
  GL_DATA_TYPE,
  GL_PROGRAM_PARAMETER,
  GL_SHADER_TYPE,
  GL_STATIC_VARIABLES
} from '@packages/webgl/static-variables';
import { GL_TEXTURES, GL_TEXTURE_TARGET, GL_TEXTURE_UNIT } from '@packages/webgl/static-variables/textures';

const typeMap = {
  [GL_DATA_TYPE.FLOAT]: {
    Type: Float32Array,
    size: 4,
    setter: floatSetter,
    arraySetter: floatArraySetter
  },
  [GL_DATA_TYPE.FLOAT_VEC2]: {
    Type: Float32Array,
    size: 8,
    setter: floatVec2Setter
  },
  [GL_DATA_TYPE.FLOAT_VEC3]: {
    Type: Float32Array,
    size: 12,
    setter: floatVec3Setter
  },
  [GL_DATA_TYPE.FLOAT_VEC4]: {
    Type: Float32Array,
    size: 16,
    setter: floatVec4Setter
  },
  [GL_DATA_TYPE.INT]: {
    Type: Int32Array,
    size: 4,
    setter: intSetter,
    arraySetter: intArraySetter
  },
  [GL_DATA_TYPE.INT_VEC2]: { Type: Int32Array, size: 8, setter: intVec2Setter },
  [GL_DATA_TYPE.INT_VEC3]: {
    Type: Int32Array,
    size: 12,
    setter: intVec3Setter
  },
  [GL_DATA_TYPE.INT_VEC4]: {
    Type: Int32Array,
    size: 16,
    setter: intVec4Setter
  },
  [GL_DATA_TYPE.UNSIGNED_INT]: {
    Type: Uint32Array,
    size: 4,
    setter: uintSetter,
    arraySetter: uintArraySetter
  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC2]: {
    Type: Uint32Array,
    size: 8,
    setter: uintVec2Setter
  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC3]: {
    Type: Uint32Array,
    size: 12,
    setter: uintVec3Setter
  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC4]: {
    Type: Uint32Array,
    size: 16,
    setter: uintVec4Setter
  },
  [GL_DATA_TYPE.BOOL]: {
    Type: Uint32Array,
    size: 4,
    setter: intSetter,
    arraySetter: intArraySetter
  },
  [GL_DATA_TYPE.BOOL_VEC2]: {
    Type: Uint32Array,
    size: 8,
    setter: intVec2Setter
  },
  [GL_DATA_TYPE.BOOL_VEC3]: {
    Type: Uint32Array,
    size: 12,
    setter: intVec3Setter
  },
  [GL_DATA_TYPE.BOOL_VEC4]: {
    Type: Uint32Array,
    size: 16,
    setter: intVec4Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT2]: {
    Type: Float32Array,
    size: 16,
    setter: floatMat2Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT3]: {
    Type: Float32Array,
    size: 36,
    setter: floatMat3Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT4]: {
    Type: Float32Array,
    size: 64,
    setter: floatMat4Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT2x3]: {
    Type: Float32Array,
    size: 24,
    setter: floatMat23Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT2x4]: {
    Type: Float32Array,
    size: 32,
    setter: floatMat24Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT3x2]: {
    Type: Float32Array,
    size: 24,
    setter: floatMat32Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT3x4]: {
    Type: Float32Array,
    size: 48,
    setter: floatMat34Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT4x2]: {
    Type: Float32Array,
    size: 32,
    setter: floatMat42Setter
  },
  [GL_DATA_TYPE.FLOAT_MAT4x3]: {
    Type: Float32Array,
    size: 48,
    setter: floatMat43Setter
  },
  [GL_DATA_TYPE.SAMPLER_2D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D
  },
  [GL_DATA_TYPE.SAMPLER_CUBE]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP
  },
  [GL_DATA_TYPE.SAMPLER_3D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_3D
  },
  [GL_DATA_TYPE.SAMPLER_2D_SHADOW]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D
  },
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_2D_ARRAY
  },
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY_SHADOW]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_2D_ARRAY
  },
  [GL_DATA_TYPE.SAMPLER_CUBE_SHADOW]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP
  },
  [GL_DATA_TYPE.INT_SAMPLER_2D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D
  },
  [GL_DATA_TYPE.INT_SAMPLER_3D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_3D
  },
  [GL_DATA_TYPE.INT_SAMPLER_CUBE]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP
  },
  [GL_DATA_TYPE.INT_SAMPLER_2D_ARRAY]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_2D_ARRAY
  },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D
  },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_3D]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_3D
  },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_CUBE]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP
  },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D_ARRAY]: {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: GL_TEXTURES.TEXTURE_2D_ARRAY
  }
};

/**
 * Returns the corresponding bind point for a given sampler type
 */
function getBindPointForSamplerType(_: Partial<WebGLRenderingContext>, type: GL_DATA_TYPE) {
  return typeMap[type].bindPoint;
}

// This kind of sucks! If you could compose functions as in `var fn = gl[name];`
// this code could be a lot smaller but that is sadly really slow (T_T)

function floatSetter(gl: Pick<WebGLRenderingContext, 'uniform1f'>, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1f(location, v);
  };
}

function floatArraySetter(gl: Pick<WebGLRenderingContext, 'uniform1fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1fv(location, v);
  };
}

function floatVec2Setter(gl: Pick<WebGLRenderingContext, 'uniform2fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2fv(location, v);
  };
}

function floatVec3Setter(gl: Pick<WebGLRenderingContext, 'uniform3fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3fv(location, v);
  };
}

function floatVec4Setter(gl: Pick<WebGLRenderingContext, 'uniform4fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4fv(location, v);
  };
}

function intSetter(gl: Pick<WebGLRenderingContext, 'uniform1i'>, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1i(location, v);
  };
}

function intArraySetter(gl: Pick<WebGLRenderingContext, 'uniform1iv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1iv(location, v);
  };
}

function intVec2Setter(gl: Pick<WebGLRenderingContext, 'uniform2iv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2iv(location, v);
  };
}

function intVec3Setter(gl: Pick<WebGLRenderingContext, 'uniform3iv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3iv(location, v);
  };
}

function intVec4Setter(gl: Pick<WebGLRenderingContext, 'uniform4iv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4iv(location, v);
  };
}

function uintSetter(gl: Pick<WebGL2RenderingContextBase, 'uniform1ui'>, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1ui(location, v);
  };
}

function uintArraySetter(gl: Pick<WebGL2RenderingContextBase, 'uniform1uiv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1uiv(location, v);
  };
}

function uintVec2Setter(gl: Pick<WebGL2RenderingContextBase, 'uniform2uiv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2uiv(location, v);
  };
}

function uintVec3Setter(gl: Pick<WebGL2RenderingContextBase, 'uniform3uiv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3uiv(location, v);
  };
}

function uintVec4Setter(gl: Pick<WebGL2RenderingContextBase, 'uniform4uiv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4uiv(location, v);
  };
}

function floatMat2Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix2fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2fv(location, false, v);
  };
}

function floatMat3Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix3fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3fv(location, false, v);
  };
}

function floatMat4Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix4fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4fv(location, false, v);
  };
}

function floatMat23Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix2x3fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2x3fv(location, false, v);
  };
}

function floatMat32Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix3x2fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3x2fv(location, false, v);
  };
}

function floatMat24Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix2x4fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2x4fv(location, false, v);
  };
}

function floatMat42Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix4x2fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4x2fv(location, false, v);
  };
}

function floatMat34Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix3x4fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3x4fv(location, false, v);
  };
}

function floatMat43Setter(gl: Pick<WebGL2RenderingContext, 'uniformMatrix4x3fv'>, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4x3fv(location, false, v);
  };
}

function samplerSetter(
  gl: Pick<WebGL2RenderingContext, 'bindSampler' | 'uniform1i' | 'activeTexture' | 'bindTexture'>,
  type: GL_DATA_TYPE,
  unit: number,
  location: WebGLUniformLocation
) {
  var bindPoint = getBindPointForSamplerType(gl, type)!;
  return function (textureOrPair: WebGLTexture | { texture: WebGLTexture | null; sampler: WebGLSampler | null }) {
    let texture;
    if (textureOrPair instanceof WebGLTexture) {
      texture = textureOrPair;
    } else {
      texture = textureOrPair.texture;
      gl.bindSampler(unit, textureOrPair.sampler);
    }
    gl.uniform1i(location, unit);
    gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + unit);
    gl.bindTexture(bindPoint, texture);
  };
}

function samplerArraySetter(
  gl: Pick<WebGL2RenderingContext, 'uniform1iv' | 'bindSampler' | 'uniform1i' | 'activeTexture' | 'bindTexture'>,
  type: GL_DATA_TYPE,
  unit: number,
  location: WebGLUniformLocation,
  size: number
) {
  var bindPoint = getBindPointForSamplerType(gl, type)!;
  var units = new Int32Array(size);
  for (var ii = 0; ii < size; ++ii) {
    units[ii] = unit + ii;
  }

  return function (textures: (WebGLTexture | { texture: WebGLTexture | null; sampler: WebGLSampler | null })[]) {
    gl.uniform1iv(location, units);
    textures.forEach((textureOrPair, index) => {
      gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + units[index]);
      let texture;
      if (textureOrPair instanceof WebGLTexture) {
        texture = textureOrPair;
      } else {
        texture = textureOrPair.texture;
        gl.bindSampler(unit, textureOrPair.sampler);
      }
      gl.bindTexture(bindPoint, texture);
    });
  };
}

function floatAttribSetter(
  gl: Pick<WebGL2RenderingContext, 'bindBuffer' | 'enableVertexAttribArray' | 'vertexAttribPointer'>,
  index: number
) {
  return function (b: {
    buffer: WebGLBuffer | null;
    numComponents?: number;
    size: number;
    type?: GL_DATA_TYPE;
    normalize?: boolean;
    stride?: number;
    offset?: number;
  }) {
    gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, b.buffer);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
      index,
      b.numComponents || b.size,
      b.type || GL_DATA_TYPE.FLOAT,
      b.normalize || false,
      b.stride || 0,
      b.offset || 0
    );
  };
}

function intAttribSetter(
  gl: Pick<WebGL2RenderingContext, 'bindBuffer' | 'enableVertexAttribArray' | 'vertexAttribIPointer'>,
  index: number
) {
  return function (b: {
    buffer: WebGLBuffer | null;
    numComponents?: number;
    size: number;
    type?: GL_DATA_TYPE;
    normalize?: boolean;
    stride?: number;
    offset?: number;
  }) {
    gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, b.buffer);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribIPointer(index, b.numComponents || b.size, b.type || GL_DATA_TYPE.INT, b.stride || 0, b.offset || 0);
  };
}

function matAttribSetter(
  gl: Pick<WebGL2RenderingContext, 'bindBuffer' | 'enableVertexAttribArray' | 'vertexAttribPointer'>,
  index: number,
  typeInfo: {
    size: number;
    count: number;
  }
) {
  const defaultSize = typeInfo.size;
  const count = typeInfo.count;

  return function (b: {
    buffer: WebGLBuffer | null;
    numComponents?: number;
    size?: number;
    type?: GL_DATA_TYPE;
    normalize?: boolean;
    stride?: number;
    offset?: number;
  }) {
    gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, b.buffer);
    const numComponents = b.size || b.numComponents || defaultSize;
    const size = numComponents / count;
    const type = b.type || GL_DATA_TYPE.FLOAT;
    const typeInfo = typeMap[type];
    const stride = typeInfo.size * numComponents;
    const normalize = b.normalize || false;
    const offset = b.offset || 0;
    const rowOffset = stride / count;
    for (let i = 0; i < count; ++i) {
      gl.enableVertexAttribArray(index + i);
      gl.vertexAttribPointer(index + i, size, type, normalize, stride, offset + rowOffset * i);
    }
  };
}

function addLineNumbers(src: string, lineOffset: number = 0) {
  ++lineOffset;

  return src
    .split('\n')
    .map(function (line, ndx) {
      return ndx + lineOffset + ': ' + line;
    })
    .join('\n');
}

export function createShader(
  gl: Pick<
    WebGL2RenderingContext,
    'createShader' | 'shaderSource' | 'compileShader' | 'getShaderParameter' | 'getShaderInfoLog'
  >,
  vSrc: string,
  vType: GL_SHADER_TYPE
) {
  const shader = gl.createShader(vType)!;
  gl.shaderSource(shader, vSrc);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, GL_STATIC_VARIABLES.COMPILE_STATUS);
  if (!success) {
    console.error(addLineNumbers(vSrc), '\n', gl.getShaderInfoLog(shader));
  }
  return shader;
}

const shaderTypes = [GL_SHADER_TYPE.VERTEX_SHADER, GL_SHADER_TYPE.FRAGMENT_SHADER];

export function createProgram(
  gl: Pick<
    WebGL2RenderingContext,
    | 'createProgram'
    | 'createShader'
    | 'shaderSource'
    | 'compileShader'
    | 'getShaderParameter'
    | 'getShaderInfoLog'
    | 'attachShader'
    | 'deleteShader'
    | 'bindAttribLocation'
    | 'linkProgram'
    | 'getProgramParameter'
    | 'getProgramInfoLog'
  >,
  sources: string[],
  locations: string[]
) {
  const program = gl.createProgram()!;
  const shaders = sources.map((src, ndx) => {
    const shader = createShader(gl, src, shaderTypes[ndx]);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
    return shader;
  });

  if (locations) {
    locations.forEach((name, ndx) => {
      gl.bindAttribLocation(program, ndx, name);
    });
  }

  gl.linkProgram(program);

  shaders.forEach((shader) => gl.deleteShader(shader));
  var linked = gl.getProgramParameter(program, GL_STATIC_VARIABLES.LINK_STATUS);
  if (!linked) {
    console.error(
      '--vertexShader--\n',
      addLineNumbers(sources[0]),
      '--fragmentShader--\n',
      addLineNumbers(sources[1]),
      '--error--\n',
      gl.getProgramInfoLog(program)
    );
  }
  return program;
}

function createUniformSetters(
  gl: Pick<
    WebGL2RenderingContext,
    | 'getUniformLocation'
    | 'bindSampler'
    | 'activeTexture'
    | 'bindTexture'
    | 'uniform1f'
    | 'uniform1fv'
    | 'uniform2fv'
    | 'uniform3fv'
    | 'uniform4fv'
    | 'uniform1i'
    | 'uniform1iv'
    | 'uniform2iv'
    | 'uniform3iv'
    | 'uniform4iv'
    | 'uniform1ui'
    | 'uniform1uiv'
    | 'uniform2uiv'
    | 'uniform3uiv'
    | 'uniform4uiv'
    | 'uniformMatrix2fv'
    | 'uniformMatrix3fv'
    | 'uniformMatrix4fv'
    | 'uniformMatrix2x3fv'
    | 'uniformMatrix3x2fv'
    | 'uniformMatrix2x4fv'
    | 'uniformMatrix4x2fv'
    | 'uniformMatrix3x4fv'
    | 'uniformMatrix4x3fv'
    | 'getProgramParameter'
    | 'getActiveUniform'
  >,
  program: WebGLProgram
) {
  let textureUnit = 0;

  function createUniformSetter(program: WebGLProgram, uniformInfo: { name: string; size: number; type: GL_DATA_TYPE }) {
    const location = gl.getUniformLocation(program, uniformInfo.name)!;
    const isArray = uniformInfo.size > 1 && uniformInfo.name.substr(-3) === '[0]';
    const type = uniformInfo.type;
    const typeInfo = typeMap[type];

    if (!typeInfo) {
      throw 'unknown type: 0x' + type.toString(16); // we should never get here.
    }

    if (typeInfo.bindPoint) {
      // it's a sampler
      const unit = textureUnit;
      textureUnit += uniformInfo.size;

      if (isArray) {
        return typeInfo.arraySetter(gl, type, unit, location, uniformInfo.size);
      } else {
        return typeInfo.setter(gl, type, unit, location);
      }
    } else {
      if (typeInfo.arraySetter && isArray) {
        return (typeInfo.arraySetter as typeof floatArraySetter)(gl, location);
      } else {
        return (typeInfo.setter as typeof floatSetter)(gl, location);
      }
    }
  }

  const uniformSetters: {
    [key: string]: ReturnType<typeof createUniformSetter>;
  } = {};
  const numUniforms = gl.getProgramParameter(program, GL_PROGRAM_PARAMETER.ACTIVE_UNIFORMS);

  for (let ii = 0; ii < numUniforms; ++ii) {
    const uniformInfo = gl.getActiveUniform(program, ii);
    if (!uniformInfo) {
      break;
    }
    let name = uniformInfo.name;
    // remove the array suffix.
    if (name.substr(-3) === '[0]') {
      name = name.substr(0, name.length - 3);
    }
    const setter = createUniformSetter(program, uniformInfo);
    uniformSetters[name] = setter;
  }
  return uniformSetters;
}

export function createProgramInfo(
  gl: Pick<
    WebGL2RenderingContext,
    | 'createProgram'
    | 'createShader'
    | 'shaderSource'
    | 'compileShader'
    | 'getShaderParameter'
    | 'getShaderInfoLog'
    | 'attachShader'
    | 'deleteShader'
    | 'bindAttribLocation'
    | 'linkProgram'
    | 'getProgramParameter'
    | 'getProgramInfoLog'
    | 'getUniformLocation'
    | 'bindSampler'
    | 'activeTexture'
    | 'bindTexture'
    | 'uniform1f'
    | 'uniform1fv'
    | 'uniform2fv'
    | 'uniform3fv'
    | 'uniform4fv'
    | 'uniform1i'
    | 'uniform1iv'
    | 'uniform2iv'
    | 'uniform3iv'
    | 'uniform4iv'
    | 'uniform1ui'
    | 'uniform1uiv'
    | 'uniform2uiv'
    | 'uniform3uiv'
    | 'uniform4uiv'
    | 'uniformMatrix2fv'
    | 'uniformMatrix3fv'
    | 'uniformMatrix4fv'
    | 'uniformMatrix2x3fv'
    | 'uniformMatrix3x2fv'
    | 'uniformMatrix2x4fv'
    | 'uniformMatrix4x2fv'
    | 'uniformMatrix3x4fv'
    | 'uniformMatrix4x3fv'
    | 'getProgramParameter'
    | 'getActiveUniform'
  >,
  sources: string[],
  attributes: string[]
) {
  const program = createProgram(gl, sources, attributes);
  const uniformSetters = createUniformSetters(gl, program);
  const programInfo = {
    program: program,
    uniformSetters: uniformSetters
  };

  return programInfo;
}
