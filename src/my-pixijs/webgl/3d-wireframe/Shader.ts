import * as m4 from '@webgl/math/m4';
import {
  GL_BUFFER_TYPE,
  GL_DATA_TYPE,
  GL_PROGRAM_PARAMETER,
  GL_SHADER_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from '@webgl/static-variables';

export class Shader {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  nextTexture: number;
  attributes: any;
  uniforms: any;

  [key: string]: any;

  constructor(gl: WebGL2RenderingContext, opts: any) {
    this.gl = gl;
    if (opts.program) {
      this.program = opts.program;
    } else if (opts.vertexShader && opts.fragmentShader) {
      this.program = createProgram(gl, opts.vertexShader, opts.fragmentShader);
    } else {
      throw new Error('No shader program or sources found.');
    }

    this.nextTexture = 0;
    this.gl.useProgram(this.program);

    const attributes = (this.attributes = opts.attributes || []);

    for (const name in attributes) {
      this.addAttribute(name, attributes[name]);
    }
    // const uniforms = (this.uniforms = opts.uniforms || []);
    // for (const name in uniforms) {
    //   this.addUniform(name, uniforms[name]);
    // }
  }

  addUniform(
    name: string,
    uniform: {
      value: any;
      location?: WebGLUniformLocation | null;
      type: GL_DATA_TYPE | GL_TEXTURES;
      textureNum?: number;
      texture?: any;
      bind?(): void;
    }
  ) {
    //console.info('Shader.addUniform("%s", uniform);', name, uniform);
    const gl = this.gl;
    const program = this.program;

    if (this.uniforms[name] === undefined) {
      this.uniforms[name] = uniform;
    }

    if (this[name] === undefined) {
      this[name] = uniform;
    }

    if (uniform.location === undefined) {
      uniform.location = gl.getUniformLocation(program, name);
    }

    switch (uniform.type) {
      case GL_DATA_TYPE.FLOAT:
        // gl.uniform1fv(location, []); ← alternative
        gl.uniform1f(uniform.location, uniform.value);
        break;
      case GL_DATA_TYPE.FLOAT_VEC2:
        gl.uniform2fv(uniform.location, uniform.value);
        // gl.uniform2f(location, x, y)
        break;
      case GL_DATA_TYPE.FLOAT_VEC3:
        gl.uniform3fv(uniform.location, uniform.value);
        // gl.uniform2f(location, x, y, z)
        break;
      case GL_DATA_TYPE.FLOAT_VEC4:
        gl.uniform4fv(uniform.location, uniform.value);
        // gl.uniform2f(location, x, y, z, w)
        break;

      case GL_DATA_TYPE.INT:
        gl.uniform1i(uniform.location, uniform.value);
        // gl.uniform1iv(location, []);
        break;
      case GL_DATA_TYPE.INT_VEC2:
        // gl.uniform2i(location, x, y);
        gl.uniform2iv(uniform.location, uniform.value);
        break;
      case GL_DATA_TYPE.INT_VEC3:
        // gl.uniform3i(location, x, y, z);
        gl.uniform3iv(uniform.location, uniform.value);
        break;
      case GL_DATA_TYPE.INT_VEC4:
        // gl.uniform4i(location, x, y, z, w);
        gl.uniform4iv(uniform.location, uniform.value);
        break;

      case GL_DATA_TYPE.FLOAT_MAT2:
        uniform.value = uniform.value || [1, 0, 0, 1];
        gl.uniformMatrix2fv(uniform.location, false, uniform.value);
        break;
      case GL_DATA_TYPE.FLOAT_MAT4:
        uniform.value = uniform.value || m4.identity();
        gl.uniformMatrix4fv(uniform.location, false, uniform.value);
        break;

      case GL_TEXTURES.TEXTURE_2D:
        if (uniform.textureNum === undefined) {
          uniform.textureNum = this.nextTexture++;
        }
        // uniform.texture = uniform.texture || new Texture(gl);
        uniform.texture = uniform.texture;
        gl.uniform1i(uniform.location, uniform.textureNum);
        gl.activeTexture((gl as any)['TEXTURE' + uniform.textureNum]);
        break;
      default:
        throw new Error(
          'Unknown uniform type: ' + uniform.type + ' for uniform ' + name
        );
    }
    return uniform;
  }

  addAttribute(name: string, attribute: any) {
    //console.info('Shader.addAttribute("%s", attribute);', name, attribute);
    const gl = this.gl;
    const program = this.program;

    this[name] = attribute;
    attribute.location = gl.getAttribLocation(program, name);

    switch (attribute.type) {
      case gl.ARRAY_BUFFER:
        attribute.buffer = gl.createBuffer();
        //attribute.buffer.itemSize = attribute.itemSize;
        //attribute.buffer.itemCount = attribute.itemCount;
        gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, attribute.buffer);
        attribute.value =
          attribute.value ||
          new Array(attribute.itemSize * attribute.itemCount);
        gl.bufferData(
          GL_BUFFER_TYPE.ARRAY_BUFFER,
          new Float32Array(attribute.value),
          gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(attribute.location);
        gl.vertexAttribPointer(
          attribute.location,
          attribute.itemSize,
          GL_DATA_TYPE.FLOAT,
          false,
          0,
          0
        );
        break;
      default:
        throw new Error(
          'Unknown attribute type: ' + attribute.type + ' for attribute ' + name
        );
    }
  }

  bindUniform(name: string) {
    // console.info('Shader.bindUniform("%s");', name);
    const gl = this.gl;
    const uniform = this.uniforms[name];
    this.addUniform(name, uniform);
    switch (uniform.type) {
      case GL_TEXTURES.TEXTURE_2D:
        gl.bindTexture(GL_TEXTURES.TEXTURE_2D, uniform.texture.glTexture);
        break;
    }
  }

  bindAttribute(name: string) {
    const gl = this.gl;
    const attribute = this.attributes[name];

    switch (attribute.type) {
      case GL_BUFFER_TYPE.ARRAY_BUFFER:
        gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, attribute.buffer);
        gl.bufferData(
          GL_BUFFER_TYPE.ARRAY_BUFFER,
          new Float32Array(attribute.value),
          GL_STATIC_VARIABLES.STATIC_DRAW
        );
        //gl.enableVertexAttribArray(attribute.location);
        gl.vertexAttribPointer(
          attribute.location,
          attribute.itemSize,
          GL_DATA_TYPE.FLOAT,
          false,
          0,
          0
        );
        break;
      default:
        throw new Error(
          'Unknown attribute type: ' + attribute.type + ' for attribute ' + name
        );
    }
  }

  bind() {
    this.gl.useProgram(this.program);
    for (const uName in this.uniforms) {
      this.bindUniform(uName);
    }
    for (const aName in this.attributes) {
      this.bindAttribute(aName);
    }
  }
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string
) {
  console.log(`createProgram`);
  const vertexShader = gl.createShader(GL_SHADER_TYPE.VERTEX_SHADER)!;

  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);

  const fragmentShader = gl.createShader(GL_SHADER_TYPE.FRAGMENT_SHADER)!;
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, GL_PROGRAM_PARAMETER.LINK_STATUS)) {
    throw (
      'Shader.createProgram > Program link error: ' +
      gl.getProgramInfoLog(program)
    );
  }
  return program;
}
