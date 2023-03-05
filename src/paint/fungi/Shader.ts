import {
  GL_DATA_TYPE,
  GL_PROGRAM_PARAMETER,
  GL_SHADER_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";
import {
  GL_TEXTURE_TARGET,
  GL_TEXTURE_UNIT,
} from "@webgl/static-variables/textures";

import { Colour } from "./Colour";
import { Context } from "./Context";

//#######################################################################################################

interface IUniform {
  readonly name: string;
  readonly type: string; // GL_DATA_TYPE,
  readonly loc: WebGLUniformLocation;
  data: any;
}

function parse_uniform_data(type: string, value: any) {
  switch (type) {
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    case "rgb":
    case "rgba":
      value = new Colour(value);
      break;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    /*
      case "sampler2D"	: 
      case "samplerCube"	:
        let tmp = ( value instanceof Texture )? value : Cache.get( value ); 
        if( tmp == null ){
          console.error( "Uniform.parse: Texture not found", value );
          return this;
        }else value = tmp;
      break;
      */
  }

  return Array.isArray(value) && value.length == 0 ? null : value;
}

function create_uniform(
  name: string,
  type: string,
  loc: WebGLUniformLocation,
  data?: any
): IUniform {
  return {
    name,
    type,
    loc,
    data: parse_uniform_data(type, data),
  };
}

export interface IShader {
  name: string;
  program: WebGLProgram;
  uniforms: { [key: string]: IUniform };
  options: {
    depthTest: boolean;
    blend: boolean;
    sampleAlphaCoverage: boolean;
    cullFace: boolean;
  };
}

function create_i_shader(
  name: string,
  program: WebGLProgram,
  uniforms: { [key: string]: IUniform } = {}
): IShader {
  return {
    name,
    program,
    uniforms,
    options: {
      depthTest: true,
      blend: false,
      sampleAlphaCoverage: false,
      cullFace: true,
    },
  };
}

interface UniformOption {
  name: string;
  type: string;
  value?: any;
}

/** Create a shader by passing in its code and what type */
function compile_shader(
  ctx: Pick<
    WebGL2RenderingContext,
    | "createShader"
    | "shaderSource"
    | "compileShader"
    | "getShaderParameter"
    | "deleteShader"
    | "getShaderInfoLog"
  >,
  src: string,
  type: GL_SHADER_TYPE
): WebGLShader {
  const shader = ctx.createShader(type)!;
  ctx.shaderSource(shader, src);
  ctx.compileShader(shader);

  //Get Error data if shader failed compiling
  if (!ctx.getShaderParameter(shader, GL_STATIC_VARIABLES.COMPILE_STATUS)) {
    ctx.deleteShader(shader);

    throw new Error(
      `Error compiling shader : ${src} \n ${ctx.getShaderInfoLog(shader)}`
    );
  }

  return shader;
}

/** Link two compiled shaders to create a program for rendering. */
function create_shader_program(
  gl: Pick<
    WebGL2RenderingContext,
    | "createProgram"
    | "attachShader"
    | "deleteProgram"
    | "transformFeedbackVaryings"
    | "linkProgram"
    | "getProgramParameter"
    | "getProgramInfoLog"
    | "detachShader"
    | "deleteShader"
  >,
  vert: WebGLShader,
  frag: WebGLShader,
  transFeedbackVars = null,
  transFeedbackInterleaved = false
): WebGLProgram {
  // Link shaders together
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);

  //Force predefined locations for specific attributes. If the attibute isn't used in the shader its location will default to -1
  //ctx.bindAttribLocation(prog,ATTR_POSITION_LOC,ATTR_POSITION_NAME);
  //ctx.bindAttribLocation(prog,ATTR_NORMAL_LOC,ATTR_NORMAL_NAME);
  //ctx.bindAttribLocation(prog,ATTR_UV_LOC,ATTR_UV_NAME);

  // Need to setup Transform Feedback Varying Vars before linking the program.
  if (transFeedbackVars != null) {
    gl.transformFeedbackVaryings(
      prog,
      transFeedbackVars,
      transFeedbackInterleaved
        ? GL_STATIC_VARIABLES.INTERLEAVED_ATTRIBS
        : GL_STATIC_VARIABLES.SEPARATE_ATTRIBS
    );
  }

  gl.linkProgram(prog);

  // Check if successful
  if (!gl.getProgramParameter(prog, GL_PROGRAM_PARAMETER.LINK_STATUS)) {
    console.error("Error creating shader program.", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
  }

  // Can delete the shaders since the program has been made.
  gl.detachShader(prog, vert); // TODO, detaching might cause issues on some browsers, Might only need to delete.
  gl.detachShader(prog, frag);
  gl.deleteShader(frag);
  gl.deleteShader(vert);

  return prog;
}

// Only do this for additional debugging.
function validate_program(
  gl: Pick<
    WebGL2RenderingContext,
    | "validateProgram"
    | "getProgramParameter"
    | "getProgramInfoLog"
    | "deleteProgram"
  >,
  prog: WebGLProgram
) {
  gl.validateProgram(prog);
  if (!gl.getProgramParameter(prog, GL_PROGRAM_PARAMETER.VALIDATE_STATUS)) {
    console.error("Error validating program", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
  }
}

/** Compile Vertex/Fragment Shaders then Link them as a Program */
export function create_shader(
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
  >,
  vert_src: string,
  frag_src: string,
  do_dalidate: boolean = true,
  transFeedbackVars: any = null,
  transFeedbackInterleaved: any = false
) {
  let vert = compile_shader(gl, vert_src, GL_SHADER_TYPE.VERTEX_SHADER)!;
  if (!vert) {
    throw new Error(`Error creating vertix shader program.`);
  }

  let frag = compile_shader(gl, frag_src, GL_SHADER_TYPE.FRAGMENT_SHADER)!;
  if (!frag) {
    gl.deleteShader(vert);

    throw new Error(`Error creating fragment shader program.`);
  }

  const prog = create_shader_program(
    gl,
    vert,
    frag,
    transFeedbackVars,
    transFeedbackInterleaved
  );

  do_dalidate && validate_program(gl, prog);

  return prog;
}

/**
 * @param name Shader name
 * @param src_vert vertix shader
 * @param src_frag fragment shader
 * @param uniforms Uniform objects
 * @param ubos Uniform Buffer Objects
 *
 * is using
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
 *  | "getUniformBlockIndex"
 *  | "uniformBlockBinding"
 * >
 * ```
 */
export function new_shader(
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
    | "getUniformBlockIndex"
    | "uniformBlockBinding"
  >,
  name: string,
  src_vert: string,
  src_frag: string,
  uniformOptions?: UniformOption[],
  ubos?: any
): IShader {
  // TODO Check if shader exists in cache

  // Compile the shader Code, When successful, create struct to wrap the program
  let program = create_shader(gl, src_vert, src_frag, true)!;

  const uniforms: { [key: string]: IUniform } = {};

  if (uniformOptions) {
    for (let i = 0; i < uniformOptions.length; i++) {
      const itm = uniformOptions[i];
      const loc = gl.getUniformLocation(program, itm.name)!;

      if (loc) {
        uniforms[itm.name] = create_uniform(itm.name, itm.type, loc, itm.value);
      } else {
        throw new Error(`add_uniform : Uniform not found ${itm.name}`);
      }
    }
  }

  const shader: IShader = create_i_shader(name, program, uniforms);

  if (ubos) {
    for (const u of ubos) {
      if (!u) {
        throw new Error(`UBO Object undefined for ${name} ${ubos}`);
      }

      const idx = gl.getUniformBlockIndex(shader.program, u.name);
      if (idx > 1000) {
        throw new Error(`Ubo not found in shader ${name} : ${u.name}`);
      }
      gl.uniformBlockBinding(shader.program, idx, u.bind_point);
    }
  }

  return shader;
}

/**
 * not using gl context
 */
export function new_material(
  sh: IShader,
  uniforms: any = null,
  options: any = null
): IMaterial {
  let mat = create_material(sh);

  // Copy Uniforms
  for (const k in sh.uniforms) {
    mat.uniforms[k] = { ...mat.uniforms[k] };
  }

  // Load in custom Uniform Data if exists
  if (uniforms) {
    for (let u_name in uniforms) {
      const u = mat.uniforms[u_name];
      if (!u) {
        throw new Error(
          `Uniform: ${u_name} not found in material ${mat.shader.name}`
        );
      }

      u.data = parse_uniform_data(u.type, data);
    }
  }

  // Load in custom Option Data if exists
  if (options) {
    mat.options = { ...options };
  } else {
    // Copy Options
    mat.options = { ...sh.options };
  }

  return mat;
}

class ShaderFactory {
  POS_LOC = 0;
  NORM_LOC = 1;
  UV_LOC = 2;
  COLOR_LOC = 3;
  SKIN_IDX_LOC = 8;
  SKIN_WGT_LOC = 9;

  cache = new Map<string, IShader>();

  constructor(readonly ctx: Context) {}

  get(name: any) {
    return this.cache.get(name);
  }

  load_uniforms(o: any) {
    let name;
    let itm;
    let map = o.uniforms;
    let ctx = this.ctx;
    const gl: Pick<
      WebGL2RenderingContext,
      | "uniform1f"
      | "uniform1fv"
      | "uniform2fv"
      | "uniform3fv"
      | "uniform3iv"
      | "uniform4fv"
      | "uniform1i"
      | "uniformMatrix4fv"
      | "uniformMatrix3fv"
      | "uniformMatrix2x4fv"
      | "uniformMatrix3x4fv"
      | "activeTexture"
      | "bindTexture"
    > = ctx.gl;
    let tex_slot = 0;

    for ([name, itm] of map) {
      //console.log( itm );
      switch (itm.type) {
        case "float":
          gl.uniform1f(itm.loc, itm.data);
          break;
        case "afloat":
          gl.uniform1fv(itm.loc, itm.data);
          break;
        case "vec2":
          gl.uniform2fv(itm.loc, itm.data);
          break;

        case "rgb":
          gl.uniform3fv(itm.loc, itm.data.rgb);
          break;
        case "vec3":
          gl.uniform3fv(itm.loc, itm.data);
          break;
        case "ivec3":
          gl.uniform3iv(itm.loc, itm.data);
          break;

        case "rgba":
          gl.uniform4fv(itm.loc, itm.data.rgba);
          break;
        case "vec4":
          gl.uniform4fv(itm.loc, itm.data);
          break;

        case "int":
          gl.uniform1i(itm.loc, itm.data);
          break;

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        case "mat4":
          gl.uniformMatrix4fv(itm.loc, false, itm.data);
          break;
        case "mat3":
          gl.uniformMatrix3fv(itm.loc, false, itm.data);
          break;
        case "mat2x4":
          gl.uniformMatrix2x4fv(itm.loc, false, itm.data);
          break;
        case "mat3x4":
          gl.uniformMatrix3x4fv(itm.loc, false, itm.data);
          break;

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        case "sampler2D":
          //if( !(itm.data instanceof Texture) ){
          //	let tmp = this.tex.get( itm.data );
          //	if( !tmp )	console.error( "Shader.load_uniforms: Texture not found", itm.data );
          //	else		itm.data = tmp;
          //}
          //console.log( itm.data.id );
          gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + tex_slot);
          gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, itm.data.id);
          gl.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        case "sampler2DArray":
          gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + tex_slot);
          gl.bindTexture(GL_TEXTURES.TEXTURE_2D_ARRAY, itm.data);
          gl.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        case "samplerCube":
          gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + tex_slot);
          gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP, itm.data);
          gl.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        default:
          console.error(
            "unknown uniform type %s for %s in %s",
            itm.type,
            name,
            o.name
          );
          break;
      }
    }
    return this;
  }

  // #region BINDING
  unbind() {
    this.ctx.gl.useProgram(null);
    return this;
  }

  bind(sh: any) {
    this.ctx.gl.useProgram(sh.program);
    return this;
  }
}

export interface IMaterial {
  shader: IShader;
  uniforms: { [key: string]: IUniform };
  options: {
    depthTest: boolean;
    blend: boolean;
    sampleAlphaCoverage: boolean;
    cullFace: boolean;
  };
}

function create_material(shader: IShader): IMaterial {
  return {
    shader,
    uniforms: {},
    options: {
      depthTest: true,
      blend: false,
      sampleAlphaCoverage: false,
      cullFace: true,
    },
  };
}

class Material {
  uniforms: { [key: string]: IUniform } = {};
  options: { [key: string]: any } = {
    depthTest: true,
    blend: false,
    sampleAlphaCoverage: false,
    cullFace: true,
  };

  constructor(readonly shader: IShader) {}

  set(u_name: string, data: any) {
    const u = this.uniforms[u_name];
    if (!u) {
      throw new Error(
        `Uniform: ${u_name} not found in material ${this.shader.name}`
      );
    }

    u.data = parse_uniform_data(u.type, data);
    return this;
  }

  get(u_name: any) {
    let u = this.uniforms[u_name];
    if (!u) {
      throw new Error(
        `Uniform: ${u_name} not found in material ${this.shader.name}`
      );
    }
    return u.data;
  }
}
