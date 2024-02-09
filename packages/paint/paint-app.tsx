import { createPointerData } from '@utils/create-pointer-data';
import { m4, v2 } from '@webgl/math';
import { GL_DRAW_ARRAYS_MODE, GL_STATIC_VARIABLES } from '@webgl/static-variables';
import { createEffect } from 'solid-js';
import { IMesh } from './fungi/mesh';
import { postQuadNDC } from './quads-2';

import drawShaderFragSrc from './draw-shader.frag?raw';
import drawShaderVertSrc from './draw-shader.vert?raw';

import { createShaderProgram } from './fungi/create-shader-program';
import { bindFramebuffer, createFramebufferMap, unbindFramebuffer } from './fungi/fbo-2';
import {
  clearScreenBuffer,
  createWebglContext,
  setCanvasSize,
  setClearColor,
  setWebglViewport,
  setupSomeWebglDefaults
} from './fungi/old/Context';
import postShaderFragSrc from './post-shader.frag?raw';
import postShaderVertSrc from './post-shader.vert?raw';

import { createWindowSize } from '@solid-primitives/resize-observer';
import { createMesh } from './fungi/create-vao';

export default function Paint() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none'
      }}
    ></canvas>
  ) as HTMLCanvasElement;

  const pointer = createPointerData(canvas);

  const drawBound = createDrawBound();

  createEffect(() => {
    const data = pointer();

    // Compute the Drawing Area
    drawBound.computeDrawBound(data.prev, data.move);

    // Draw into Custom Frame buffer texture
    draw(data.pressure);

    // Render Texture to Screen
    render();
  });

  const gl = createWebglContext(canvas);
  setupSomeWebglDefaults(gl);
  setClearColor(gl, '#270E33');
  const width = window.innerWidth;
  const height = window.innerHeight;
  setCanvasSize(canvas, width, height);
  setWebglViewport(gl, width, height);
  clearScreenBuffer(gl);

  // full screan texture
  const mainFbo = createFramebufferMap(gl, {
    width: window.innerWidth,
    height: window.innerHeight,
    buffers: [{ attach: 0, name: 'color', type: 'color', mode: 'tex', pixel: 'byte' }]
  });

  const orthoProj = m4.identity();
  m4.ortho(orthoProj, 0, width, height, 0, -100, 100);

  // { mesh, shader, material }
  const brush = createMesh(gl);

  // Shader that draws a brush over a line segment

  // shader to draw brush on the quad
  const drawShader = createShaderProgram(gl, {
    vert: drawShaderVertSrc,
    frag: drawShaderFragSrc,
    uniforms: (uniform) => ({
      ortho: uniform.name('ortho').mat4,
      brushSize: uniform.name('brush_size').float,
      bound: uniform.name('bound').vec4,
      segment: uniform.name('segment').vec4
    })
  });

  const quad: IMesh = postQuadNDC(gl);

  // Shader that uses a unit quad to draw a texture to screen

  const postSahder = createShaderProgram(gl, {
    vert: postShaderVertSrc,
    frag: postShaderFragSrc,
    uniforms: (uniform) => ({
      bufColor: uniform.name('buf_color').sampler2D
    })
  });

  // This function handles drawing the brush shader onto a custom frame buffer texture
  function draw(pressure: number) {
    // Setup

    // gl.disable(GL_STATIC_VARIABLES.DEPTH_TEST);

    // Experiment with Blending Modes to get something that works well
    gl.enable(GL_STATIC_VARIABLES.BLEND);
    // gl.blendFunc(GL_STATIC_VARIABLES.ONE, GL_STATIC_VARIABLES.ONE); //BLEND_ADDITIVE
    gl.blendFunc(GL_STATIC_VARIABLES.SRC_ALPHA, GL_STATIC_VARIABLES.ONE); // BLEND_ALPHA_ADDITIVE
    // gl.blendFunc( GL_STATIC_VARIABLES.ONE, GL_STATIC_VARIABLES.ZERO ); // BLEND_OVERRIDE
    // gl.blendFunc(
    //   GL_STATIC_VARIABLES.SRC_ALPHA,
    //   GL_STATIC_VARIABLES.ONE_MINUS_SRC_ALPHA
    // ); //BLEND_ALPHA

    // Load Shader and update uniforms
    drawShader.useProgram();
    drawShader.ortho(orthoProj);
    drawShader.brushSize(drawBound.brushSize * pressure);
    drawShader.bound(drawBound.bound);
    drawShader.segment(drawBound.segment);

    bindFramebuffer(gl, mainFbo); //.clear( $fbo );	// Load Custom FrameBuffer
    brush.bindVertexArray(); // Load Quad

    // Draw
    brush.draw();

    // Cleanup
    // wireFrameSahder.clearProgram();
    drawShader.clearProgram();
    brush.clearVertexArray();
  }

  // This function handles rendering the custom frame buffer texture to the screen
  function render() {
    unbindFramebuffer(gl); // Unbind any Custom Frame Buffer
    clearScreenBuffer(gl); // Clear Screen Buffer

    // SHADER
    postSahder.useProgram();
    gl.activeTexture(GL_STATIC_VARIABLES.TEXTURE0); // Turn on Texture Slot
    gl.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, mainFbo.buffers.color.id); // Bind Texture
    postSahder.bufColor(0);
    // Mesh
    gl.bindVertexArray(quad.vao);

    // Draw
    gl.drawElements(GL_DRAW_ARRAYS_MODE.TRIANGLES, quad.elementCount, quad.elementType, 0);

    // Cleanup
    postSahder.clearProgram();

    // wireFrameSahder.useProgram();
    // wireFrameSahder.uniforms.ortho(ortho_proj);
    // gl.drawArrays(GL_DRAW_ARRAYS_MODE.LINES, 0, quad.element_cnt);

    gl.bindVertexArray(null);
  }

  const size = createWindowSize();

  createEffect(() => {
    const { width, height } = size;
    setCanvasSize(canvas, width, height);
    setWebglViewport(gl, width, height);
    m4.ortho(orthoProj, 0, width, height, 0, -100, 100);
    render();
  });

  return canvas;
}

function createDrawBound() {
  let brushSize = 20;
  // Bounding Area to Draw
  const bound = new Float32Array(4);

  // The 2 points of a Segment
  const segment = new Float32Array(4);

  // The idea is to create a Quad that can cover the area needed
  // to draw a line segment. So first we compute the bounding box
  // for the segment, then we enlarge it by the brush size to make
  // we have all the space we need to draw the brush along the segment
  function computeDrawBound(prev: v2.Vec2, move: v2.Vec2) {
    let x_min: number;
    let x_max: number;
    let y_min: number;
    let y_max: number;

    // Compute the Min and Max Bounds
    if (prev[0] < move[0]) {
      x_min = prev[0];
      x_max = move[0];
    } else {
      x_min = move[0];
      x_max = prev[0];
    }

    if (prev[1] < move[1]) {
      y_min = prev[1];
      y_max = move[1];
    } else {
      y_min = move[1];
      y_max = prev[1];
    }

    // Expand the bounding box by the size of the brush
    x_min = Math.max(x_min - brushSize, 0);
    y_min = Math.max(y_min - brushSize, 0);
    x_max += brushSize;
    y_max += brushSize;

    bound[0] = x_min; // Position (XY)
    bound[1] = y_min;
    bound[2] = x_max - x_min; // Scale (W/H)
    bound[3] = y_max - y_min;

    segment[0] = prev[0]; // Segment Point A
    segment[1] = prev[1];
    segment[2] = move[0]; // Segment Point B
    segment[3] = move[1];
  }

  return {
    brushSize,
    bound,
    segment,
    computeDrawBound
  };
}
