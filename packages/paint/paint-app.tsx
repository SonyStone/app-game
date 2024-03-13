import { GL_CAPABILITIES, GL_DRAW_ARRAYS_MODE, GL_FUNC_SEPARATE } from '@packages/webgl/static-variables';
import { createPointerData } from '@utils/create-pointer-data';
import { createEffect } from 'solid-js';
import { postQuadNDC } from './quads-2';

import drawShaderFragSrc from './draw-shader.frag?raw';
import drawShaderVertSrc from './draw-shader.vert?raw';

import { createShaderProgram } from './fungi/create-shader-program';
import { bindFramebuffer, createFramebufferMap, unbindFramebuffer } from './fungi/fbo';
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

import { Mat4 } from '@packages/math/m4';
import { FVec2 } from '@packages/math/v2';
import { GL_TEXTURES, GL_TEXTURE_UNIT } from '@packages/webgl/static-variables/textures';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createBrushMesh } from './create-brush-mesh';

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

  const gl = createWebglContext(canvas);
  setupSomeWebglDefaults(gl);
  setClearColor(gl, '#270E33');
  const width = window.innerWidth;
  const height = window.innerHeight;
  setCanvasSize(canvas, width, height);
  setWebglViewport(gl, width, height);
  clearScreenBuffer(gl);

  // full screan texture
  const screanTextureFbo = createFramebufferMap(gl, {
    width: window.innerWidth,
    height: window.innerHeight,
    buffers: [{ attach: 0, name: 'color', type: 'color', mode: 'tex', pixel: 'byte' }]
  });

  // Shader that draws a brush over a line segment

  // shader to draw brush on the quad
  const brush = {
    program: createShaderProgram(gl, {
      vert: drawShaderVertSrc,
      frag: drawShaderFragSrc,
      uniforms: (uniform) => ({
        ortho: uniform.name('ortho').mat4,
        brushSize: uniform.name('brush_size').float,
        bound: uniform.name('bound').vec4,
        segment: uniform.name('segment').vec4
      })
    }),
    mesh: createBrushMesh(gl)
  };

  const orthoProj = Mat4.ortho(0, width, height, 0, -100, 100);

  const screen = {
    mesh: postQuadNDC(gl),
    // Shader that uses a unit quad to draw a texture to screen
    program: createShaderProgram(gl, {
      vert: postShaderVertSrc,
      frag: postShaderFragSrc,
      uniforms: (uniform) => ({
        bufColor: uniform.name('buf_color').sampler2D
      })
    })
  };

  const bindFboAsTexture = () => {
    gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0); // Turn on Texture Slot
    gl.bindTexture(GL_TEXTURES.TEXTURE_2D, screanTextureFbo.buffers.color.id); // Bind Texture
    screen.program.bufColor(0);
  };

  // This function handles drawing the brush shader onto a custom frame buffer texture
  function draw(pressure: number) {
    // Setup

    // Experiment with Blending Modes to get something that works well
    gl.enable(GL_CAPABILITIES.BLEND);
    gl.blendFunc(GL_FUNC_SEPARATE.SRC_ALPHA, GL_FUNC_SEPARATE.ONE); // BLEND_ALPHA_ADDITIVE

    // Load Shader and update uniforms
    brush.program.useProgram();
    brush.program.ortho(orthoProj);
    brush.program.brushSize(drawBound.brushSize * pressure);
    brush.program.bound(drawBound.bound);
    brush.program.segment(drawBound.segment);
    bindFramebuffer(gl, screanTextureFbo); // Load Custom FrameBuffer
    brush.mesh.draw();
    brush.program.clearProgram();
    unbindFramebuffer(gl); // Unbind any Custom Frame Buffer
  }

  // This function handles rendering the custom frame buffer texture to the screen
  function render() {
    clearScreenBuffer(gl); // Clear Screen Buffer

    // SHADER
    screen.program.useProgram();
    bindFboAsTexture();
    // Mesh
    gl.bindVertexArray(screen.mesh.vao);

    // Draw
    gl.drawElements(GL_DRAW_ARRAYS_MODE.TRIANGLES, screen.mesh.elementCount, screen.mesh.elementType, 0);

    // Cleanup
    screen.program.clearProgram();

    gl.bindVertexArray(null);
  }

  const size = createWindowSize();

  createEffect(() => {
    const data = pointer();

    // Compute the Drawing Area
    drawBound.computeDrawBound(data.prev, data.move);

    // Draw into Custom Frame buffer texture
    draw(data.pressure);

    // Render Texture to Screen
    render();
  });

  createEffect(() => {
    const { width, height } = size;
    setCanvasSize(canvas, width, height);
    setWebglViewport(gl, width, height);
    orthoProj.ortho(0, width, height, 0, -100, 100);
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
  function computeDrawBound(prev: FVec2, move: FVec2) {
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
