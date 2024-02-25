import { GL_PROGRAM_PARAMETER, GL_SHADER_TYPE, GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';

const DEV = import.meta.env.DEV;

export const createShaderProgram = <T>(
  gl: WebGL2RenderingContext,
  props: {
    vert: string;
    frag: string;
    uniforms: UniformsBuilder<T>;
  }
): {
  program: WebGLProgram;
  useProgram(): void;
  clearProgram(): void;
} & T => {
  const program = createShader(gl, props.vert, props.frag);
  const uniforms = createUniforms(gl, program, props.uniforms);

  return {
    program,
    useProgram() {
      gl.useProgram(program);
    },
    clearProgram() {
      gl.useProgram(null);
    },
    ...uniforms
  };
};

/** Compile Vertex/Fragment Shaders then Link them as a Program */
export const createShader = (
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
  transFeedbackVars: any = null,
  transFeedbackInterleaved: any = false
) => {
  const vert = compileShader(gl, vertSource, GL_SHADER_TYPE.VERTEX_SHADER)!;
  const frag = compileShader(gl, fragSource, GL_SHADER_TYPE.FRAGMENT_SHADER)!;
  const prog = _createShaderProgram(gl, vert, frag, transFeedbackVars, transFeedbackInterleaved);

  DEV && validateProgram(gl, prog);

  return prog;
};

/** Create a shader by passing in its code and what type */
const compileShader = (gl: WebGL2RenderingContext, source: string, type: GL_SHADER_TYPE): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  //Get Error data if shader failed compiling
  if (!gl.getShaderParameter(shader, GL_STATIC_VARIABLES.COMPILE_STATUS)) {
    gl.deleteShader(shader);

    throw new Error(`Error compiling shader : ${source} \n ${gl.getShaderInfoLog(shader)}`);
  }

  return shader;
};

/** Link two compiled shaders to create a program for rendering. */
const _createShaderProgram = (
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
  transFeedbackVars = null,
  transFeedbackInterleaved = false
): WebGLProgram => {
  // Link shaders together
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);

  // Need to setup Transform Feedback Varying Vars before linking the program.
  if (transFeedbackVars != null) {
    gl.transformFeedbackVaryings(
      prog,
      transFeedbackVars,
      transFeedbackInterleaved ? GL_STATIC_VARIABLES.INTERLEAVED_ATTRIBS : GL_STATIC_VARIABLES.SEPARATE_ATTRIBS
    );
  }

  gl.linkProgram(prog);

  // Check if successful
  if (!gl.getProgramParameter(prog, GL_PROGRAM_PARAMETER.LINK_STATUS)) {
    console.error('Error creating shader program.', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
  }

  // Can delete the shaders since the program has been made.
  gl.detachShader(prog, vert); // TODO, detaching might cause issues on some browsers, Might only need to delete.
  gl.deleteShader(vert);

  gl.detachShader(prog, frag);
  gl.deleteShader(frag);

  return prog;
};

// Only do this for additional debugging.
const validateProgram = (
  gl: Pick<WebGL2RenderingContext, 'validateProgram' | 'getProgramParameter' | 'getProgramInfoLog' | 'deleteProgram'>,
  prog: WebGLProgram
) => {
  gl.validateProgram(prog);
  if (!gl.getProgramParameter(prog, GL_PROGRAM_PARAMETER.VALIDATE_STATUS)) {
    console.error('Error validating program', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
  }
};

/**
 * build uniforms quick acsess
 */
type UniformsBuilder<T> = (obj: {
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
}) => T;

const createUniforms = <T>(gl: WebGL2RenderingContext, program: WebGLProgram, builder: UniformsBuilder<T>) => {
  function getUniform(name: string) {
    return gl.getUniformLocation(program, name)!;
  }

  const uniforms = builder({
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
        }
      };
    }
  });

  return uniforms;
};
