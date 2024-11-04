export default function webglTest() {
  const canvas = document.createElement('canvas');

  const context = canvas.getContext('webgl2')!;

  canvas.width = 800;
  canvas.height = 800;

  const vertShader = compileShader(
    context,
    context.VERTEX_SHADER,
    `#version 300 es
 
    in vec4 position;

    void main() {
        
      gl_Position = position;
    }   
    `
  );

  const fragShader = compileShader(
    context,
    context.FRAGMENT_SHADER,
    `#version 300 es
 
    precision highp float;

    out vec4 color;

    void main() {
        
      color = vec4(1, 1, 1, 1);
    }   
    `
  );

  const program = linkProgram(context, vertShader, fragShader);
  context.useProgram(program);

  const vertices = new Float32Array([-0.7, -0.7, 0.7, -0.7, 0.0, 0.7]);

  const indexes = new Uint16Array([0, 1, 2]);

  const vao = context.createVertexArray();
  context.bindVertexArray(vao);

  const positionAttributeLocation = context.getAttribLocation(program, 'position');
  context.bindBuffer(context.ARRAY_BUFFER, context.createBuffer());
  context.bufferData(context.ARRAY_BUFFER, vertices, context.STATIC_DRAW);

  context.vertexAttribPointer(positionAttributeLocation, 2, context.FLOAT, false, 0, 0);
  context.enableVertexAttribArray(positionAttributeLocation);

  const elementArrayBuffer = context.createBuffer();
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, elementArrayBuffer);
  context.bufferData(context.ELEMENT_ARRAY_BUFFER, indexes, context.STATIC_DRAW);

  context.viewport(0, 0, context.canvas.width, context.canvas.height);

  context.clearColor(0, 0, 0, 1);
  context.clear(context.COLOR_BUFFER_BIT);

  context.drawElements(context.TRIANGLES, indexes.length, context.UNSIGNED_SHORT, 0);

  return canvas;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    throw new Error(`Could not compile WebGL shader. \n\n${info}`);
  }

  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertShader: WebGLShader, fragShader: WebGLShader) {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Could not link WebGL program. \n\n${info}`);
  }

  return program;
}
