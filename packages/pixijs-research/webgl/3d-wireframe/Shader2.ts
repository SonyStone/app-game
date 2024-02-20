import { m4, v2, v3, v4 } from '@webgl/math';
import { GL_BUFFER_TYPE, GL_DATA_TYPE, GL_STATIC_VARIABLES } from '@webgl/static-variables';
import { createProgram } from './Shader';

interface Uniform {
  name: string;
  bind(): void;
}

export function addUniformBuilder(gl: WebGL2RenderingContext, program: WebGLProgram) {
  return {
    [GL_DATA_TYPE.FLOAT](name: string) {
      const location = gl.getUniformLocation(program, name);

      return {
        name,
        value: 0,
        set(value: number) {
          this.value = value;
          return this;
        },
        bind() {
          gl.uniform1f(location, this.value);
          return this;
        }
      };
    },
    [GL_DATA_TYPE.FLOAT_VEC2](name: string) {
      const location = gl.getUniformLocation(program, name);

      return {
        name,
        value: v2.create(0, 0),
        set(value: v2.Vec2) {
          this.value = value;
          return this;
        },
        bind() {
          gl.uniform2fv(location, this.value);
          return this;
        }
      };
    },
    [GL_DATA_TYPE.FLOAT_VEC3](name: string) {
      const location = gl.getUniformLocation(program, name);

      return {
        name,
        value: v3.create(0, 0, 0),
        set(value: v3.Vec3Tuple) {
          this.value = value;
          return this;
        },
        bind() {
          gl.uniform3fv(location, this.value);
          return this;
        }
      };
    },
    [GL_DATA_TYPE.FLOAT_MAT2](name: string) {
      const location = gl.getUniformLocation(program, name);

      return {
        name,
        value: v4.create(0, 0, 0, 0),
        set(value: v4.Vec4) {
          this.value = value;
          return this;
        },
        bind(value: v4.Vec4) {
          gl.uniformMatrix4fv(location, false, value);
          return this;
        }
      };
    },
    [GL_DATA_TYPE.FLOAT_MAT4](name: string) {
      const location = gl.getUniformLocation(program, name);

      return {
        name,
        value: m4.identity(),
        set(value: m4.Mat4) {
          this.value = value;
          return this;
        },
        bind() {
          gl.uniformMatrix4fv(location, false, this.value);
          return this;
        }
      };
    }
  };
}

export function createShader(gl: WebGL2RenderingContext) {
  return {
    createProgram(vertexShaderSource: string, fragmentShaderSource: string) {
      const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl.useProgram(program);

      return new ShaderBuilder(gl, program);
    }
  };
}

class ShaderBuilder {
  binds = [] as any[];
  data = {} as any;

  uniformBuilder = addUniformBuilder(this.gl, this.program);

  constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram
  ) {}

  addUniform(name: string, type: GL_DATA_TYPE, value?: any) {
    const { gl, program, uniformBuilder } = this;
    const location = gl.getUniformLocation(program, name);
    const uniform = uniformBuilder[type](name);
    if (value) {
      uniform.set(value);
    }

    this.data[name] = uniform;
    this.binds.push(uniform);

    return this;
  }

  addAttribute(
    name: string,
    itemSize: number,
    itemCount: number,
    value: Float32Array = new Float32Array(itemSize * itemCount)
  ) {
    const { gl, program } = this;
    const location = gl.getAttribLocation(program, name);
    const buffer = gl.createBuffer();
    gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, buffer);
    gl.bufferData(GL_BUFFER_TYPE.ARRAY_BUFFER, value, GL_STATIC_VARIABLES.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, itemSize, GL_DATA_TYPE.FLOAT, false, 0, 0);

    const attribute = {
      name,
      value,
      buffer,
      location,
      itemSize,
      set(value: Float32Array) {
        this.value = value;
        return this;
      },
      bind() {
        gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, this.buffer);
        gl.bufferData(GL_BUFFER_TYPE.ARRAY_BUFFER, this.value, GL_STATIC_VARIABLES.STATIC_DRAW);
        gl.vertexAttribPointer(this.location, this.itemSize, GL_DATA_TYPE.FLOAT, false, 0, 0);
      }
    };

    this.data[name] = attribute;
    this.binds.push(attribute);

    return this;
  }

  build() {
    return new ShaderRun(this.gl, this.program, this.binds, this.data);
  }
}

export class ShaderRun {
  [key: string]: any;

  constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram,
    private binds: any[],
    data: any
  ) {
    for (const key in data) {
      this[key] = data[key];
    }
  }

  bind() {
    this.gl.useProgram(this.program);
    for (const bind of this.binds) {
      bind.bind();
    }
  }
}
