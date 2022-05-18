import { Colour } from './Colour';
import { Context } from './Context';
import { TextureFactory } from './Texture';

//#######################################################################################################

class Uniform {
  data: any;

  constructor(
    readonly name: string,
    readonly type: string,
    readonly loc: WebGLUniformLocation,
    data?: any
  ) {
    this.data = !data ? null : this.parse(data);
  }

  set(data: any) {
    this.data = this.parse(data);
    return this;
  }

  clone() {
    let u = new Uniform(this.name, this.type, this.loc);

    if (Array.isArray(this.data)) u.data = this.data.slice(0);
    else u.data = this.data;

    return u;
  }

  parse(value: any) {
    switch (this.type) {
      //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      case 'rgb':
      case 'rgba':
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
}

class Shader {
  name: any;
  program: any = null;
  uniforms = new Map();

  options = {
    depthTest: true,
    blend: false,
    sampleAlphaCoverage: false,
    cullFace: true,
  };

  constructor(name: string, glProgram: WebGLProgram) {
    this.name = name;
    this.program = glProgram;
  }

  set_depth_test(depthTest: boolean) {
    this.options.depthTest = depthTest;
    return this;
  }
  set_blend(v: boolean) {
    this.options.blend = v;
    return this;
  }
  set_alpha_coverage(sampleAlphaCoverage: boolean) {
    this.options.sampleAlphaCoverage = sampleAlphaCoverage;
    return this;
  }
  set_cullface(cullFace: boolean) {
    this.options.cullFace = cullFace;
    return this;
  }
}

interface UniformOption {
  name: string;
  type: string;
  value?: any;
}

export class ShaderFactory {
  POS_LOC = 0;
  NORM_LOC = 1;
  UV_LOC = 2;
  COLOR_LOC = 3;
  SKIN_IDX_LOC = 8;
  SKIN_WGT_LOC = 9;

  cache = new Map<string, Shader>();

  constructor(readonly gl: Context) {}

  /**
   * @param name Shader name
   * @param src_vert vertix shader
   * @param src_frag fragment shader
   * @param uniforms Uniform objects
   * @param ubos Uniform Buffer Objects
   * @returns
   */
  new(
    name: string,
    src_vert: string,
    src_frag: string,
    uniforms?: UniformOption[],
    ubos?: any
  ) {
    // TODO Check if shader exists in cache

    // Compile the shader Code, When successful, create struct to wrap the program
    let glProgram = this.create_shader(src_vert, src_frag, false)!;
    if (!glProgram) {
      throw new Error(`cannot create shader WebGLProgram`);
    }

    let shader = new Shader(name, glProgram);

    if (uniforms) {
      let i: number = 0;
      let loc: WebGLUniformLocation;
      let itm: UniformOption;
      for (; i < uniforms.length; i++) {
        itm = uniforms[i];
        loc = this.gl.ctx.getUniformLocation(shader.program, itm.name)!;

        if (loc) {
          shader.uniforms.set(
            itm.name,
            new Uniform(itm.name, itm.type, loc, itm.value)
          );
        } else {
          throw new Error(`add_uniform : Uniform not found ${itm.name}`);
        }
      }
    }

    if (ubos) {
      let idx: number;
      let u: any;
      for (u of ubos) {
        if (!u) {
          throw new Error(`UBO Object undefined for ${name} ${ubos}`);
        }

        idx = this.gl.ctx.getUniformBlockIndex(shader.program, u.name);
        if (idx > 1000) {
          throw new Error(`Ubo not found in shader ${name} : ${u.name}`);
        }
        this.gl.ctx.uniformBlockBinding(shader.program, idx, u.bind_point);
      }
    }

    this.cache.set(name, shader);

    return shader;
  }

  get(name: any) {
    return this.cache.get(name);
  }

  load_uniforms(o: any) {
    let name;
    let itm;
    let map = o.uniforms;
    let gl = this.gl;
    let tex_slot = 0;

    for ([name, itm] of map) {
      //console.log( itm );
      switch (itm.type) {
        case 'float':
          gl.ctx.uniform1f(itm.loc, itm.data);
          break;
        case 'afloat':
          gl.ctx.uniform1fv(itm.loc, itm.data);
          break;
        case 'vec2':
          gl.ctx.uniform2fv(itm.loc, itm.data);
          break;

        case 'rgb':
          gl.ctx.uniform3fv(itm.loc, itm.data.rgb);
          break;
        case 'vec3':
          gl.ctx.uniform3fv(itm.loc, itm.data);
          break;
        case 'ivec3':
          gl.ctx.uniform3iv(itm.loc, itm.data);
          break;

        case 'rgba':
          gl.ctx.uniform4fv(itm.loc, itm.data.rgba);
          break;
        case 'vec4':
          gl.ctx.uniform4fv(itm.loc, itm.data);
          break;

        case 'int':
          gl.ctx.uniform1i(itm.loc, itm.data);
          break;

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        case 'mat4':
          gl.ctx.uniformMatrix4fv(itm.loc, false, itm.data);
          break;
        case 'mat3':
          gl.ctx.uniformMatrix3fv(itm.loc, false, itm.data);
          break;
        case 'mat2x4':
          gl.ctx.uniformMatrix2x4fv(itm.loc, false, itm.data);
          break;
        case 'mat3x4':
          gl.ctx.uniformMatrix3x4fv(itm.loc, false, itm.data);
          break;

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        case 'sampler2D':
          //if( !(itm.data instanceof Texture) ){
          //	let tmp = this.tex.get( itm.data );
          //	if( !tmp )	console.error( "Shader.load_uniforms: Texture not found", itm.data );
          //	else		itm.data = tmp;
          //}
          //console.log( itm.data.id );
          gl.ctx.activeTexture(gl.ctx.TEXTURE0 + tex_slot);
          gl.ctx.bindTexture(gl.ctx.TEXTURE_2D, itm.data.id);
          gl.ctx.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        case 'sampler2DArray':
          gl.ctx.activeTexture(gl.ctx.TEXTURE0 + tex_slot);
          gl.ctx.bindTexture(gl.ctx.TEXTURE_2D_ARRAY, itm.data);
          gl.ctx.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        case 'samplerCube':
          gl.ctx.activeTexture(gl.ctx.TEXTURE0 + tex_slot);
          gl.ctx.bindTexture(gl.ctx.TEXTURE_CUBE_MAP, itm.data);
          gl.ctx.uniform1i(itm.loc, tex_slot);
          tex_slot++;
          break;

        default:
          console.error(
            'unknown uniform type %s for %s in %s',
            itm.type,
            name,
            o.name
          );
          break;
      }
    }
    return this;
  }

  new_material(
    name: string,
    uniforms: any = null,
    options: any = null
  ): Material {
    let sh = this.cache.get(name);
    if (!sh) {
      throw new Error(`No Shader by the name ${name}.`);
    }

    let mat = new Material(sh);

    // Copy Uniforms
    let k;
    let v;
    for ([k, v] of sh.uniforms) {
      mat.uniforms.set(k, v.clone());
    }

    // Copy Options
    mat.options = { ...sh.options };

    // Load in custom Uniform Data if exists
    if (uniforms) {
      for (let n in uniforms) {
        mat.set(n, uniforms[n]);
      }
    }

    // Load in custom Option Data if exists
    if (options) {
      let o;
      for (o in options) {
        mat.options[o] = options[o];
      }
    }

    return mat;
  }

  // #region BINDING
  unbind() {
    this.gl.ctx.useProgram(null);
    return this;
  }

  bind(sh: any) {
    this.gl.ctx.useProgram(sh.program);
    return this;
  }

  // #region COMPILE SHADER
  // Compile Vertex/Fragment Shaders then Link them as a Program
  create_shader(
    vert_src: string,
    frag_src: string,
    do_dalidate: boolean = true,
    transFeedbackVars: any = null,
    transFeedbackInterleaved: any = false
  ) {
    let vert = this.compile_shader(vert_src, this.gl.ctx.VERTEX_SHADER)!;
    if (!vert) {
      throw new Error(`Error creating vertix shader program.`);
    }

    let frag = this.compile_shader(frag_src, this.gl.ctx.FRAGMENT_SHADER)!;
    if (!frag) {
      this.gl.ctx.deleteShader(vert);

      throw new Error(`Error creating fragment shader program.`);
    }

    return this.create_shader_program(
      vert,
      frag,
      do_dalidate,
      transFeedbackVars,
      transFeedbackInterleaved
    );
  }

  //Create a shader by passing in its code and what type
  compile_shader(src: string, type: number) {
    let shader = this.gl.ctx.createShader(type)!;
    this.gl.ctx.shaderSource(shader, src);
    this.gl.ctx.compileShader(shader);

    //Get Error data if shader failed compiling
    if (!this.gl.ctx.getShaderParameter(shader, this.gl.ctx.COMPILE_STATUS)) {
      this.gl.ctx.deleteShader(shader);

      throw new Error(
        `Error compiling shader : ${src} \n ${this.gl.ctx.getShaderInfoLog(
          shader
        )}`
      );
    }

    return shader;
  }

  //Link two compiled shaders to create a program for rendering.
  create_shader_program(
    vert: WebGLShader,
    frag: WebGLShader,
    do_validate = true,
    transFeedbackVars = null,
    transFeedbackInterleaved = false
  ) {
    // Link shaders together
    let prog = this.gl.ctx.createProgram()!;
    this.gl.ctx.attachShader(prog, vert);
    this.gl.ctx.attachShader(prog, frag);

    //Force predefined locations for specific attributes. If the attibute isn't used in the shader its location will default to -1
    //ctx.bindAttribLocation(prog,ATTR_POSITION_LOC,ATTR_POSITION_NAME);
    //ctx.bindAttribLocation(prog,ATTR_NORMAL_LOC,ATTR_NORMAL_NAME);
    //ctx.bindAttribLocation(prog,ATTR_UV_LOC,ATTR_UV_NAME);

    // Need to setup Transform Feedback Varying Vars before linking the program.
    if (transFeedbackVars != null) {
      this.gl.ctx.transformFeedbackVaryings(
        prog,
        transFeedbackVars,
        transFeedbackInterleaved
          ? this.gl.ctx.INTERLEAVED_ATTRIBS
          : this.gl.ctx.SEPARATE_ATTRIBS
      );
    }

    this.gl.ctx.linkProgram(prog);

    // Check if successful
    if (!this.gl.ctx.getProgramParameter(prog, this.gl.ctx.LINK_STATUS)) {
      console.error(
        'Error creating shader program.',
        this.gl.ctx.getProgramInfoLog(prog)
      );
      this.gl.ctx.deleteProgram(prog);
      return null;
    }

    // Only do this for additional debugging.
    if (do_validate) {
      this.gl.ctx.validateProgram(prog);
      if (!this.gl.ctx.getProgramParameter(prog, this.gl.ctx.VALIDATE_STATUS)) {
        console.error(
          'Error validating program',
          this.gl.ctx.getProgramInfoLog(prog)
        );
        this.gl.ctx.deleteProgram(prog);
        return null;
      }
    }

    // Can delete the shaders since the program has been made.
    this.gl.ctx.detachShader(prog, vert); // TODO, detaching might cause issues on some browsers, Might only need to delete.
    this.gl.ctx.detachShader(prog, frag);
    this.gl.ctx.deleteShader(frag);
    this.gl.ctx.deleteShader(vert);

    return prog;
  }
  // #endregion
}

export class Material {
  uniforms = new Map<string, any>();
  options: { [key: string]: any } = {
    depthTest: true,
    blend: false,
    sampleAlphaCoverage: false,
    cullFace: true,
  };

  constructor(readonly shader: any) {}

  set(u_name: string, data: any) {
    let u = this.uniforms.get(u_name);
    if (!u) {
      throw new Error(
        `Uniform: ${u_name} not found in material ${this.shader.name}`
      );
    }

    u.set(data);
    return this;
  }

  get(u_name: any) {
    let u = this.uniforms.get(u_name);
    if (!u) {
      throw new Error(
        `Uniform: ${u_name} not found in material ${this.shader.name}`
      );
    }
    return u.data;
  }

  set_depth_test(v: any) {
    this.options.depthTest = v;
    return this;
  }

  set_blend(v: any) {
    this.options.blend = v;
    return this;
  }

  set_alpha_coverage(v: any) {
    this.options.sampleAlphaCoverage = v;
    return this;
  }

  set_cullface(v: any) {
    this.options.cullFace = v;
    return this;
  }
}
