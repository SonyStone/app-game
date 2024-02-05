import { Colour } from './Colour';

const DEV = import.meta.env.DEV;

//#######################################################################################################

interface IUniform {
  readonly name: string;
  readonly type: string; // GL_DATA_TYPE,
  readonly loc: WebGLUniformLocation;
  data: any;
}

function parseUniformData(type: string, value: any) {
  switch (type) {
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

function createUniform(name: string, type: string, loc: WebGLUniformLocation, data?: any): IUniform {
  return {
    name,
    type,
    loc,
    data: parseUniformData(type, data)
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

function createIShader(name: string, program: WebGLProgram, uniforms: { [key: string]: IUniform } = {}): IShader {
  return {
    name,
    program,
    uniforms,
    options: {
      depthTest: true,
      blend: false,
      sampleAlphaCoverage: false,
      cullFace: true
    }
  };
}

interface UniformOption {
  name: string;
  type: string;
  value?: any;
}

/**
 * @param name Shader name
 * @param vert vertix shader
 * @param frag fragment shader
 * @param uniforms Uniform objects
 * @param ubos Uniform Buffer Objects
 */
export function newShader(
  gl: WebGL2RenderingContext,
  name: string,
  vert: string,
  frag: string,
  uniformOptions?: UniformOption[],
  ubos?: any
): IShader {
  // TODO Check if shader exists in cache

  // Compile the shader Code, When successful, create struct to wrap the program
  let program = createShader(gl, vert, frag, true)!;

  const uniforms: { [key: string]: IUniform } = {};

  if (uniformOptions) {
    for (let i = 0; i < uniformOptions.length; i++) {
      const itm = uniformOptions[i];
      const loc = gl.getUniformLocation(program, itm.name)!;

      if (loc) {
        uniforms[itm.name] = createUniform(itm.name, itm.type, loc, itm.value);
      } else {
        throw new Error(`add_uniform : Uniform not found ${itm.name}`);
      }
    }
  }

  const shader: IShader = createIShader(name, program, uniforms);

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
export function newMaterial(sh: IShader, uniforms: any = null, options: any = null): IMaterial {
  let mat = createMaterial(sh);

  // Copy Uniforms
  for (const k in sh.uniforms) {
    mat.uniforms[k] = { ...mat.uniforms[k] };
  }

  // Load in custom Uniform Data if exists
  if (uniforms) {
    for (let u_name in uniforms) {
      const u = mat.uniforms[u_name];
      if (!u) {
        throw new Error(`Uniform: ${u_name} not found in material ${mat.shader.name}`);
      }

      u.data = parseUniformData(u.type, data);
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

function createMaterial(shader: IShader): IMaterial {
  return {
    shader,
    uniforms: {},
    options: {
      depthTest: true,
      blend: false,
      sampleAlphaCoverage: false,
      cullFace: true
    }
  };
}

class Material {
  uniforms: { [key: string]: IUniform } = {};
  options: { [key: string]: any } = {
    depthTest: true,
    blend: false,
    sampleAlphaCoverage: false,
    cullFace: true
  };

  constructor(readonly shader: IShader) {}

  set(u_name: string, data: any) {
    const u = this.uniforms[u_name];
    if (!u) {
      throw new Error(`Uniform: ${u_name} not found in material ${this.shader.name}`);
    }

    u.data = parseUniformData(u.type, data);
    return this;
  }

  get(u_name: any) {
    let u = this.uniforms[u_name];
    if (!u) {
      throw new Error(`Uniform: ${u_name} not found in material ${this.shader.name}`);
    }
    return u.data;
  }
}
