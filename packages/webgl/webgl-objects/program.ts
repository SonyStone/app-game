import { GL_SHADER_TYPE } from '../static-variables';

function createShader(gl: WebGL2RenderingContext, type: GL_SHADER_TYPE, source: string) {
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
  gl: WebGL2RenderingContext,
  { vert, frag, uniforms, attributes }: ProgramParams<U, A>
) {
  const vertexShader = createShader(gl, GL_SHADER_TYPE.VERTEX_SHADER, vert)!;
  const fragmentShader = createShader(gl, GL_SHADER_TYPE.FRAGMENT_SHADER, frag)!;

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  }

  return Object.assign(program, {
    use() {
      gl.useProgram(program);
    },
    unuse() {
      gl.useProgram(null);
    },
    getAttribLocation(name: string) {
      return gl.getAttribLocation(program, name);
    },
    ...createUniforms(gl, program, uniforms),
    ...createAttributes(gl, program, attributes)
  });
}

/**
 * build uniforms quick acsess
 */
type UniformsBuilder<T> = (obj: {
  name: (name: string) => {
    location: WebGLUniformLocation;
    uniform1f(value: number): void;
    vec2(vec2: Iterable<number>): void;
    uniform3fv(vec3: Iterable<number>): void;
    uniform4fv(vec4: Iterable<number>): void;
    int(value: number): void;
    ivec2(vec2: Iterable<number>): void;
    ivec3(vec3: Iterable<number>): void;
    ivec4(vec4: Iterable<number>): void;
    sampler2D(value: number): void;
    samplerCube(value: number): void;

    mat2(mat2: Iterable<number>): void;
    mat3(mat3: Iterable<number>): void;
    mat4(mat4: Iterable<number>): void;

    bool(value: boolean): void;
  };
}) => T;

const createUniforms = <T>(gl: WebGL2RenderingContext, program: WebGLProgram, builder?: UniformsBuilder<T>) => {
  function getUniformLocation(name: string) {
    return gl.getUniformLocation(program, name)!;
  }

  if (!builder) {
    return {} as T;
  }

  const uniforms = builder({
    name(name: string) {
      const location = getUniformLocation(name);
      return {
        location,
        uniform1f(value: number) {
          gl.uniform1f(location, value);
        },
        vec2(vec2: Iterable<number>) {
          gl.uniform2fv(location, vec2);
        },
        uniform3fv(vec3: Iterable<number>) {
          gl.uniform3fv(location, vec3);
        },
        uniform4fv(vec4: Iterable<number>) {
          gl.uniform4fv(location, vec4);
        },
        int(value: number) {
          gl.uniform1i(location, value);
        },
        ivec2(vec2: Iterable<number>) {
          gl.uniform2iv(location, vec2);
        },
        ivec3(vec3: Iterable<number>) {
          gl.uniform3iv(location, vec3);
        },
        ivec4(vec4: Iterable<number>) {
          gl.uniform4iv(location, vec4);
        },
        sampler2D(value: number) {
          gl.uniform1i(location, value);
        },
        samplerCube(value: number) {
          gl.uniform1i(location, value);
        },

        mat2(mat2: Iterable<number>) {
          gl.uniformMatrix2fv(location, false, mat2);
        },
        mat3(mat3: Iterable<number>) {
          gl.uniformMatrix3fv(location, false, mat3);
        },
        mat4(mat4: Iterable<number>) {
          gl.uniformMatrix4fv(location, false, mat4);
        },

        bool(value: boolean) {
          gl.uniform1i(location, +value);
        }
      };
    }
  });

  return uniforms;
};

type AttributesBuilder<T> = (obj: {
  name: (name: string) => {
    location: number;
    pointer(size: number, type: number, stride: number, offset: number): void;
  };
}) => T;

function createAttributes<T>(gl: WebGL2RenderingContext, program: WebGLProgram, builder?: AttributesBuilder<T>) {
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
        pointer(size: number, type: number, stride: number, offset: number) {
          gl.vertexAttribPointer(location, size, type, false, stride, offset);
          gl.enableVertexAttribArray(location);
        }
      };
    }
  });

  return attributes;
}
