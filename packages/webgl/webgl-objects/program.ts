import type { WebGLRenderingContextStrict } from '../webgl-strict-types/webgl';

function createShader(gl: WebGLRenderingContextStrict, type: WebGLRenderingContextStrict.ShaderType, source: string) {
  var shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }

  console.log(gl.getShaderInfoLog(shader)); // eslint-disable-line
  gl.deleteShader(shader);
  return undefined;
}

export interface ProgramParams<U, A> {
  vert: string;
  frag: string;
  uniforms?: UniformsBuilder<U>;
  attributes?: AttributesBuilder<A>;
}

export function createProgram<U, A>(
  gl: WebGLRenderingContextStrict,
  { vert, frag, uniforms, attributes }: ProgramParams<U, A>
) {
  let program: WebGLProgram | null = null;
  const uniformData = {} as { [key: string]: any };
  const uniformExData = [] as {
    name: string;
    setUniform: (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, value: any) => void;
    location?: WebGLUniformLocation;
  }[];

  const createProgram = () => {
    if (program) {
      return;
    }
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vert)!;
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, frag)!;

    program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      console.log(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
    }
  };

  let isLocations = false;
  const setLocations = () => {
    for (const uniform of uniformExData) {
      uniform.location = gl.getUniformLocation(program!, uniform.name)!;
    }
  };

  const setUniforms = () => {
    for (const uniform of uniformExData) {
      uniform.setUniform(gl, uniform.location!, uniformData[uniform.name]);
    }
  };

  createProgram();

  return {
    use() {
      createProgram();
      gl.useProgram(program);
      if (!isLocations) {
        setLocations();
        isLocations = true;
      }
      setUniforms();
    },
    unuse() {
      gl.useProgram(null);
    },
    ...createUniforms(uniformData, uniformExData, uniforms),
    ...createAttributes(gl, program!, attributes)
  };
}

export const createUniformsMethods = <T>(
  gl: WebGLRenderingContextStrict | WebGL2RenderingContext,
  program: WebGLProgram,
  uniformsBuilder: UniformsBuilder<T>
) => {
  return uniformsBuilder({
    name: (name: string) => {
      const location = gl.getUniformLocation(program, name);
      return {
        vec2(vec2: Float32List) {
          gl.uniform2fv(location, vec2);
        },
        uniform1f(value: number) {
          gl.uniform1f(location, value);
        },
        uniform3fv(vec3: Float32List) {
          gl.uniform3fv(location, vec3);
        },
        uniform4fv(vec4: Float32List) {
          gl.uniform4fv(location, vec4);
        },
        int(value: number) {
          gl.uniform1i(location, value);
        },
        ivec2(vec2: Int32List) {
          gl.uniform2iv(location, vec2);
        },
        ivec3(vec3: Int32List) {
          gl.uniform3iv(location, vec3);
        },
        ivec4(vec4: Int32List) {
          gl.uniform4iv(location, vec4);
        },
        sampler2D(value: number) {
          gl.uniform1i(location, value);
        },
        samplerCube(value: number) {
          gl.uniform1i(location, value);
        },
        mat2(mat2: Float32List) {
          gl.uniformMatrix2fv(location, false, mat2);
        },
        mat3(mat3: Float32List) {
          gl.uniformMatrix3fv(location, false, mat3);
        },
        mat4(mat4: Float32List) {
          gl.uniformMatrix4fv(location, false, mat4);
        },
        bool(value: boolean) {
          gl.uniform1i(location, value ? 1 : 0);
        }
      };
    }
  });
};

export interface UniformsParams {
  name: (name: string) => {
    location?: WebGLUniformLocation;

    vec2(): (vec2: Float32List) => void;

    uniform1f(): (value: number) => void;
    uniform3fv(): (vec3: Float32List) => void;
    uniform4fv(): (vec4: Float32List) => void;

    int(): (value: number) => void;
    ivec2(): (vec2: Float32List) => void;
    ivec3(): (vec3: Float32List) => void;
    ivec4(): (vec4: Float32List) => void;

    sampler2D(): (value: number) => void;
    samplerCube(): (value: number) => void;

    mat2(): (mat2: Float32List) => void;
    mat3(): (mat3: Float32List) => void;
    mat4(): (mat4: Float32List) => void;

    bool(): (value: boolean) => void;
  };
}

/**
 * build uniforms quick acsess
 */
export type UniformsBuilder<T> = (obj: UniformsParams) => T;

const createUniforms = <T>(
  uniformData: { [key: string]: any },
  uniformExData: {
    name: string;
    setUniform: (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, value: any) => void;
    location?: WebGLUniformLocation;
  }[],
  builder?: UniformsBuilder<T>
) => {
  if (!builder) {
    return {} as T;
  }

  return builder({
    name(name: string) {
      const setter = <T>(value: T) => {
        uniformData[name] = value;
      };

      return {
        uniform1f() {
          uniformExData.push({ name, setUniform: uniform1f });
          return setter<number>;
        },
        vec2() {
          uniformExData.push({ name, setUniform: uniform2fv });
          return setter;
        },
        uniform3fv() {
          uniformExData.push({ name, setUniform: uniform3fv });
          return setter;
        },
        uniform4fv() {
          uniformExData.push({ name, setUniform: uniform4fv });
          return setter;
        },
        int() {
          uniformExData.push({ name, setUniform: uniform1i });
          return setter;
        },
        ivec2() {
          uniformExData.push({ name, setUniform: uniform2iv });
          return setter;
        },
        ivec3() {
          uniformExData.push({ name, setUniform: uniform3iv });
          return setter;
        },
        ivec4() {
          uniformExData.push({ name, setUniform: uniform4iv });
          return setter;
        },
        sampler2D() {
          uniformExData.push({ name, setUniform: uniform1i });
          return setter;
        },
        samplerCube() {
          uniformExData.push({ name, setUniform: uniform1i });
          return setter;
        },

        mat2() {
          uniformExData.push({ name, setUniform: uniformMatrix2fv });
          return setter;
        },
        mat3() {
          uniformExData.push({ name, setUniform: uniformMatrix3fv });
          return setter;
        },
        mat4() {
          uniformExData.push({ name, setUniform: uniformMatrix4fv });
          return setter;
        },

        bool() {
          uniformExData.push({ name, setUniform: uniform1i });
          return setter;
        }
      };
    }
  });
};

export interface AttributesParams {
  name: (name: string) => {
    location: number;
    pointer(size: number, type: number, stride: number, offset: number): void;
  };
}

type AttributesBuilder<T> = (obj: AttributesParams) => T;

// createBuffer
// bindBuffer
// bufferData
// unbind bindBuffer()

function createAttributes<T>(gl: WebGLRenderingContextStrict, program: WebGLProgram, builder?: AttributesBuilder<T>) {
  function getAttribLocation(name: string) {
    return gl.getAttribLocation(program, name);
  }

  if (!builder) {
    return {} as T;
  }

  const attributes = builder({
    name(name: string) {
      const location = getAttribLocation(name);
      return {
        location,
        pointer(size: 1 | 2 | 3 | 4, type: WebGLRenderingContextStrict.ArrayType, stride: number, offset: number) {
          gl.vertexAttribPointer(location, size, type, false, stride, offset);
          gl.enableVertexAttribArray(location);
        }
      };
    }
  });

  return attributes;
}

const uniform1f = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, value: number) =>
  gl.uniform1f(location, value);
const uniform2fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec2: Float32List) =>
  gl.uniform2fv(location, vec2);
const uniform3fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec3: Float32List) =>
  gl.uniform3fv(location, vec3);
const uniform4fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec4: Float32List) =>
  gl.uniform4fv(location, vec4);
const uniform1i = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, value: number) =>
  gl.uniform1i(location, value);
const uniform2iv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec2: Int32List) =>
  gl.uniform2iv(location, vec2);
const uniform3iv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec3: Int32List) =>
  gl.uniform3iv(location, vec3);
const uniform4iv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, vec4: Int32List) =>
  gl.uniform4iv(location, vec4);
const uniformMatrix2fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, mat2: Float32List) =>
  gl.uniformMatrix2fv(location, false, mat2);
const uniformMatrix3fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, mat3: Float32List) =>
  gl.uniformMatrix3fv(location, false, mat3);
const uniformMatrix4fv = (gl: WebGLRenderingContextStrict, location: WebGLUniformLocation, mat4: Float32List) =>
  gl.uniformMatrix4fv(location, false, mat4);
