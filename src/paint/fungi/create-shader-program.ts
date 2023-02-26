import { create_shader } from "./Shader";

/**
 * is using:
 * ```typescript
 * gl: Pick<
 *  WebGL2RenderingContext,
 *  | "createShader"
 *  | "compileShader"
 *  | "deleteShader"
 *  | "getShaderInfoLog"
 *  | "getShaderParameter"
 *  | "shaderSource"
 *  | "createProgram"
 *  | "attachShader"
 *  | "transformFeedbackVaryings"
 *  | "linkProgram"
 *  | "getProgramParameter"
 *  | "getProgramInfoLog"
 *  | "deleteProgram"
 *  | "detachShader"
 *  | "validateProgram"
 *  | "getUniformLocation"
 *  | "uniformMatrix4fv"
 *  | "uniform1f"
 *  | "uniform4fv"
 *  | "useProgram"
 * >
 * ```
 */
export function create_shader_program<T>(
  gl: Pick<
    WebGL2RenderingContext,
    | "createShader"
    | "compileShader"
    | "deleteShader"
    | "getShaderInfoLog"
    | "getShaderParameter"
    | "shaderSource"
    | "createProgram"
    | "attachShader"
    | "transformFeedbackVaryings"
    | "linkProgram"
    | "getProgramParameter"
    | "getProgramInfoLog"
    | "deleteProgram"
    | "detachShader"
    | "validateProgram"
    | "getUniformLocation"
    | "uniform1f"
    | "uniform2fv"
    | "uniform3fv"
    | "uniform4fv"
    | "uniform1i"
    | "uniform2iv"
    | "uniform3iv"
    | "uniform4iv"
    | "uniformMatrix2fv"
    | "uniformMatrix3fv"
    | "uniformMatrix4fv"
    | "useProgram"
  >,
  src_vert: string,
  src_frag: string,
  /**
   * build uniforms quick acsess
   */
  builder: (obj: {
    program: WebGLProgram;
    name: (name: string) => {
      float(value: number): void;
      vec2(vec2: Iterable<number>): void;
      vec3(vec3: Iterable<number>): void;
      vec4(vec4: Iterable<number>): void;
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
  }) => T
): {
  program: WebGLProgram;
  uniforms: T;
  useProgram(): void;
  clearProgram(): void;
} {
  const program = create_shader(gl, src_vert, src_frag, true);

  function getUniform(name: string) {
    return gl.getUniformLocation(program, name)!;
  }

  const uniforms = builder({
    program,
    name(name: string) {
      const loc = getUniform(name);
      return {
        float(value: number) {
          gl.uniform1f(loc, value);
        },
        vec2(vec2: Iterable<number>) {
          gl.uniform2fv(loc, vec2);
        },
        vec3(vec3: Iterable<number>) {
          gl.uniform3fv(loc, vec3);
        },
        vec4(vec4: Iterable<number>) {
          gl.uniform4fv(loc, vec4);
        },
        int(value: number) {
          gl.uniform1i(loc, value);
        },
        ivec2(vec2: Iterable<number>) {
          gl.uniform2iv(loc, vec2);
        },
        ivec3(vec3: Iterable<number>) {
          gl.uniform3iv(loc, vec3);
        },
        ivec4(vec4: Iterable<number>) {
          gl.uniform4iv(loc, vec4);
        },
        sampler2D(value: number) {
          gl.uniform1i(loc, value);
        },
        samplerCube(value: number) {
          gl.uniform1i(loc, value);
        },

        mat2(mat2: Iterable<number>) {
          gl.uniformMatrix2fv(loc, false, mat2);
        },
        mat3(mat3: Iterable<number>) {
          gl.uniformMatrix3fv(loc, false, mat3);
        },
        mat4(mat4: Iterable<number>) {
          gl.uniformMatrix4fv(loc, false, mat4);
        },

        bool(value: boolean) {
          gl.uniform1i(loc, +value);
        },
      };
    },
  });

  return {
    program,
    uniforms,
    useProgram() {
      gl.useProgram(program);
    },
    clearProgram() {
      gl.useProgram(null);
    },
  };
}
