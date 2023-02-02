import { createPointerData } from "@utils/create-pointer-data";
import * as m4 from "@webgl/math/mut-m4";
import * as v2 from "@webgl/math/v2";
import {
  GL_DRAW_ARRAYS_MODE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";
import { createEffect, onCleanup } from "solid-js";
import { IMesh } from "./fungi/Mesh";
import {
  create_shader,
  IMaterial,
  new_material,
  new_shader,
} from "./fungi/Shader";
import { brush_quad_unit_corner, post_quad_ndc } from "./Quads2";

import drawShaderFragSrc from "./drawShader.frag?raw";
import drawShaderVertSrc from "./drawShader.vert?raw";

import { Context } from "./fungi/Context";
import { FramebufferObjectFactory } from "./fungi/Fbo";
import postShaderFragSrc from "./postShader.frag?raw";
import postShaderVertSrc from "./postShader.vert?raw";
import { create_program } from "./fungi/createProgram";

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

  const gl = ctx.ctx;

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
  const brush: IMesh = brush_quad_unit_corner(gl);
  // Shader that draws a brush over a line segment

  const mat_draw: IMaterial = new_material(
    new_shader(gl, "DrawShader", drawShaderVertSrc, drawShaderFragSrc, [
      { name: "ortho", type: "mat4" },
      { name: "brush_size", type: "float" },
      { name: "bound", type: "vec4" },
      { name: "segment", type: "vec4" },
    ])
  );

  const drawShader = create_program(
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
  const mat_post: IMaterial = new_material(
    new_shader(gl, "PostRender", postShaderVertSrc, postShaderFragSrc, [
      { name: "buf_color", type: "sampler2D" },
    ])
  );

  function onWindowResize() {
    ctx.set_size(window.innerWidth, window.innerHeight);
    m4.ortho(ortho_proj, 0, ctx.width, ctx.height, 0, -100, 100);
  }

  window.addEventListener("resize", onWindowResize);

  onCleanup(() => {
    window.removeEventListener("resize", onWindowResize);
  });

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

    gl.useProgram(mat_draw.shader.program);
    gl.uniformMatrix4fv(mat_draw.uniforms["ortho"].loc, false, ortho_proj);
    gl.uniform1f(
      mat_draw.uniforms["brush_size"].loc,
      draw_bound.brush_size * pressure
    );
    gl.uniform4fv(mat_draw.uniforms["bound"].loc, draw_bound.bound);
    gl.uniform4fv(mat_draw.uniforms["segment"].loc, draw_bound.segment);

    fbo.bind(main_fbo); //.clear( $fbo );	// Load Custom FrameBuffer
    gl.bindVertexArray(brush.vao); // Load Quad
    // Draw
    gl.drawElements(
      GL_DRAW_ARRAYS_MODE.TRIANGLES,
      brush.element_cnt,
      brush.element_type,
      0
    );

    drawShader.clearProgram();

    // Cleanup
    gl.useProgram(null);
    gl.bindVertexArray(null);
  }

  // This function handles rendering the custom frame buffer texture to the screen
  function render() {
    fbo.unbind(); // Unbind any Custom Frame Buffer
    ctx.clear(); // Clear Screen Buffer

    // Mesh
    gl.bindVertexArray(quad.vao);

    // SHADER
    gl.useProgram(mat_post.shader.program); // Bind Shader
    gl.activeTexture(GL_STATIC_VARIABLES.TEXTURE0); // Turn on Texture Slot
    gl.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, main_fbo.buffers.color.id); // Bind Texture
    gl.uniform1i(mat_post.uniforms["buf_color"].loc, 0); // Set Uniform Loc to Texture Slot

    // Draw
    gl.drawElements(
      GL_DRAW_ARRAYS_MODE.TRIANGLES,
      quad.element_cnt,
      quad.element_type,
      0
    );

    // Cleanup
    gl.useProgram(null);
    gl.bindVertexArray(null);
  }

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
