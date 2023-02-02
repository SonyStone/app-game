import { create_shader } from "./Shader";

export function create_program<T>(
  gl: WebGL2RenderingContext,
  src_vert: string,
  src_frag: string,
  builder: (obj: {
    program: WebGLProgram;
    name: (name: string) => {
      float(value: number): void;
      mat4(mat4: Iterable<number>): void;
      vec4(vec4: Iterable<number>): void;
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
        mat4(mat4: Iterable<number>) {
          gl.uniformMatrix4fv(loc, false, mat4);
        },
        float(value: number) {
          gl.uniform1f(loc, value);
        },
        vec4(vec4: Iterable<number>) {
          gl.uniform4fv(loc, vec4);
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
