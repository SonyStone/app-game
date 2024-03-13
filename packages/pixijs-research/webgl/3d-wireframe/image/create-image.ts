import { GL_BUFFER_USAGE, GL_TEXTURES } from '@packages/webgl/static-variables';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';

import { createProgram } from '../Shader';
import fragmentShader from './frag_shader.frag?raw';
import leaves from './leaves.jpg?url';
import vertexShader from './vert_shader.vert?raw';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve) => {
    const image = new Image();
    image.src = leaves;
    image.onload = () => resolve(image);
  });

export async function createImage(gl: WebGL2RenderingContext) {
  const program = createProgram(gl, vertexShader, fragmentShader);

  {
    // Create a texture.
    const texture = gl.createTexture();

    // make unit 0 the active texture unit
    // (i.e, the unit all other texture commands will affect.)
    gl.activeTexture(GL_TEXTURES.TEXTURE0);

    // Bind texture to 'texture unit '0' 2D bind point
    gl.bindTexture(GL_TEXTURES.TEXTURE_2D, texture);

    // Set the parameters so we don't need mips and so we're not filtering
    // and we don't repeat
    gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_WRAP_S, GL_TEXTURES.CLAMP_TO_EDGE);
    gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_WRAP_T, GL_TEXTURES.CLAMP_TO_EDGE);
    gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_MIN_FILTER, GL_TEXTURES.NEAREST);
    gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_MAG_FILTER, GL_TEXTURES.NEAREST);

    // Upload the image into the texture.
    const mipLevel = 0; // the largest mip
    const internalFormat = gl.RGBA; // format we want in the texture
    const srcFormat = gl.RGBA; // format of data we are supplying
    const srcType = gl.UNSIGNED_BYTE; // type of data we are supplying
    const image = await loadImage(leaves);

    gl.texImage2D(gl.TEXTURE_2D, mipLevel, internalFormat, srcFormat, srcType, image);
  }

  // Tell WebGL how to convert from clip space to pixels
  // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Clear the canvas
  // gl.clearColor(0, 0, 0, 0);
  // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Tell it to use our program (pair of shaders)

  return {
    bind() {
      let vao: WebGLVertexArrayObject;
      let positionBuffer: WebGLBuffer;
      {
        // look up where the vertex data needs to go.
        const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
        // Create a buffer
        positionBuffer = gl.createBuffer()!;

        // Create a vertex array object (attribute state)
        vao = gl.createVertexArray()!;

        // and make it the one we're currently working with
        gl.bindVertexArray(vao);

        // Turn on the attribute
        gl.enableVertexAttribArray(positionAttributeLocation);

        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        const size = 2; // 2 components per iteration
        const type = gl.FLOAT; // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0; // start at the beginning of the buffer
        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);
      }

      {
        const texCoordAttributeLocation = gl.getAttribLocation(program, 'a_texCoord');

        // provide texture coordinates for the rectangle.
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(GL_CONST.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(
          GL_CONST.ARRAY_BUFFER,
          new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]),
          GL_BUFFER_USAGE.STATIC_DRAW
        );
        gl.enableVertexAttribArray(texCoordAttributeLocation);

        const size = 2; // 2 components per iteration
        const type = gl.FLOAT; // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0; // start at the beginning of the buffer
        gl.vertexAttribPointer(texCoordAttributeLocation, size, type, normalize, stride, offset);
      }

      gl.useProgram(program);

      gl.bindVertexArray(vao);

      // look up uniform locations
      const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
      gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

      const imageLocation = gl.getUniformLocation(program, 'u_image');
      gl.uniform1i(imageLocation, 0);

      // Pass in the canvas resolution so we can convert from
      // pixels to clipspace in the shader
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

      setRectangle(gl, 0, 0, 240, 180);
      const primitiveType = gl.TRIANGLES;
      const offset = 0;
      const count = 6;
      gl.drawArrays(primitiveType, offset, count);
    }
  };
}

function randomInt(range: number) {
  return Math.floor(Math.random() * range);
}

// Fill the buffer with the values that define a rectangle.
function setRectangle(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number) {
  var x1 = x;
  var x2 = x + width;
  var y1 = y;
  var y2 = y + height;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]), gl.STATIC_DRAW);
}
