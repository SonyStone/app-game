import { createPointerData } from "@utils/create-pointer-data";
import * as m4 from "@webgl/math/mut-m4";
import * as v2 from "@webgl/math/v2";
import {
  GL_DRAW_ARRAYS_MODE,
  GL_STATIC_VARIABLES,
} from "@webgl/static-variables";
import { createEffect, onCleanup } from "solid-js";
import { IMesh } from "./fungi/Mesh";
import { IMaterial, new_material, new_shader } from "./fungi/Shader";
import { brush_quad_unit_corner, post_quad_ndc } from "./quads-2";

import drawShaderFragSrc from "./draw-shader.frag?raw";
import drawShaderVertSrc from "./draw-shader.vert?raw";

import { Context } from "./fungi/Context";
import { create_shader_program } from "./fungi/create-shader-program";
import { FramebufferObjectFactory } from "./fungi/Fbo";
import postShaderFragSrc from "./post-shader.frag?raw";
import postShaderVertSrc from "./post-shader.vert?raw";

import wireframeShaderFragSrc from "./wireframe-shader.frag?raw";
import wireframeShaderVertSrc from "./wireframe-shader.vert?raw";
import { createEventListener } from "@solid-primitives/event-listener";
import { create_mesh } from "./fungi/create-vao";

export default function Paint() {
  const canvas = (
    <canvas
      style={{
        "touch-action": "none",
      }}
    ></canvas>
  ) as HTMLCanvasElement;

  const pointer = createPointerData(canvas);

  const draw_bound = create_draw_bound();

  createEffect(() => {
    const data = pointer();

    // Compute the Drawing Area
    draw_bound.compute_draw_bound(data.prev, data.move);

    // Draw into Custom Frame buffer texture
    draw(data.pressure);

    // Render Texture to Screen
    render();
  });

  const ctx = new Context(canvas);
  ctx
    .set_color("#4f5f8f")
    .set_size(window.innerWidth, window.innerHeight)
    .clear();

  const gl = ctx.gl;

  const fbo = new FramebufferObjectFactory(gl);

  // full screan texture
  const main_fbo = fbo.new({
    width: window.innerWidth,
    height: window.innerHeight,
    buffers: [
      { attach: 0, name: "color", type: "color", mode: "tex", pixel: "byte" },
    ],
  });

  const ortho_proj = m4.identity();
  m4.ortho(ortho_proj, 0, ctx.width, ctx.height, 0, -100, 100);

  // { mesh, shader, material }
  const brush = create_mesh(gl);

  // Shader that draws a brush over a line segment

  // shader to draw brush on the quad
  const drawShader = create_shader_program(
    gl,
    drawShaderVertSrc,
    drawShaderFragSrc,
    (uniform) => ({
      ortho: uniform.name("ortho").mat4,
      brush_size: uniform.name("brush_size").float,
      bound: uniform.name("bound").vec4,
      segment: uniform.name("segment").vec4,
    })
  );

  const quad: IMesh = post_quad_ndc(gl);

  // Shader that uses a unit quad to draw a texture to screen
  const postSahder = create_shader_program(
    gl,
    postShaderVertSrc,
    postShaderFragSrc,
    (uniform) => ({
      buf_color: uniform.name("buf_color").sampler2D,
    })
  );

  const wireFrameSahder = create_shader_program(
    gl,
    drawShaderVertSrc,
    wireframeShaderFragSrc,
    (uniform) => ({
      ortho: uniform.name("ortho").mat4,
      brush_size: uniform.name("brush_size").float,
      bound: uniform.name("bound").vec4,
      segment: uniform.name("segment").vec4,
    })
  );

  // This function handles drawing the brush shader onto a custom frame buffer texture
  function draw(pressure: number) {
    // Setup

    // gl.disable(GL_STATIC_VARIABLES.DEPTH_TEST);

    // Experiment with Blending Modes to get something that works well
    gl.enable(GL_STATIC_VARIABLES.BLEND);
    // gl.blendFunc(GL_STATIC_VARIABLES.ONE, GL_STATIC_VARIABLES.ONE); //BLEND_ADDITIVE
    gl.blendFunc(GL_STATIC_VARIABLES.SRC_ALPHA, gl.ONE); // BLEND_ALPHA_ADDITIVE
    // gl.blendFunc( GL_STATIC_VARIABLES.ONE, GL_STATIC_VARIABLES.ZERO ); // BLEND_OVERRIDE
    // gl.blendFunc(
    //   GL_STATIC_VARIABLES.SRC_ALPHA,
    //   GL_STATIC_VARIABLES.ONE_MINUS_SRC_ALPHA
    // ); //BLEND_ALPHA

    // Load Shader and update uniforms
    drawShader.useProgram();
    drawShader.uniforms.ortho(ortho_proj);
    drawShader.uniforms.brush_size(draw_bound.brush_size * pressure);
    drawShader.uniforms.bound(draw_bound.bound);
    drawShader.uniforms.segment(draw_bound.segment);

    // wireFrameSahder.useProgram();
    // wireFrameSahder.uniforms.ortho(ortho_proj);
    // wireFrameSahder.uniforms.brush_size(draw_bound.brush_size * pressure);
    // wireFrameSahder.uniforms.bound(draw_bound.bound);
    // wireFrameSahder.uniforms.segment(draw_bound.segment);

    fbo.bind(main_fbo); //.clear( $fbo );	// Load Custom FrameBuffer
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
    fbo.unbind(); // Unbind any Custom Frame Buffer
    ctx.clear(); // Clear Screen Buffer

    // SHADER
    postSahder.useProgram();
    gl.activeTexture(GL_STATIC_VARIABLES.TEXTURE0); // Turn on Texture Slot
    gl.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, main_fbo.buffers.color.id); // Bind Texture
    postSahder.uniforms.buf_color(0);
    // Mesh
    gl.bindVertexArray(quad.vao);

    // Draw
    gl.drawElements(
      GL_DRAW_ARRAYS_MODE.TRIANGLES,
      quad.element_cnt,
      quad.element_type,
      0
    );

    // Cleanup
    postSahder.clearProgram();

    // wireFrameSahder.useProgram();
    // wireFrameSahder.uniforms.ortho(ortho_proj);
    // gl.drawArrays(GL_DRAW_ARRAYS_MODE.LINES, 0, quad.element_cnt);

    gl.bindVertexArray(null);
  }

  createEventListener(
    window,
    "resize",
    () => {
      ctx.set_size(window.innerWidth, window.innerHeight);
      m4.ortho(ortho_proj, 0, ctx.width, ctx.height, 0, -100, 100);
      render();
    },
    { passive: true }
  );

  return canvas;
}

function create_draw_bound() {
  let brush_size = 20;
  // Bounding Area to Draw
  const bound = new Float32Array(4);

  // The 2 points of a Segment
  const segment = new Float32Array(4);

  // The idea is to create a Quad that can cover the area needed
  // to draw a line segment. So first we compute the bounding box
  // for the segment, then we enlarge it by the brush size to make
  // we have all the space we need to draw the brush along the segment
  function compute_draw_bound(prev: v2.Vec2, move: v2.Vec2) {
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
    x_min = Math.max(x_min - brush_size, 0);
    y_min = Math.max(y_min - brush_size, 0);
    x_max += brush_size;
    y_max += brush_size;

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
    brush_size,
    bound,
    segment,
    compute_draw_bound,
  };
}
