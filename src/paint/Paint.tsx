import { createPointerData } from '@utils/create-pointer-data';
import * as v2 from '@webgl/math/v2';
import { createEffect } from 'solid-js';

import { createApp } from './App';
import { DrawShader } from './DrawShader';
import { Mesh } from './fungi/Mesh';
import { Material } from './fungi/Shader';
import { PostShader } from './PostShader';
import { Quads } from './Quads2';

export default function Paint() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none',
      }}></canvas>
  ) as HTMLCanvasElement;

  const pointer = createPointerData(canvas);

  createEffect(() => {
    const data = pointer();

    compute_draw_bound(data.prev, data.move); // Compute the Drawing Area
    draw(data.pressure); // Draw into Custom Frame buffer texture
    render(); // Render Texture to Screen
  });

  const app = createApp(canvas);

  const $brush: Mesh = Quads.unit_corner(app.buffer, app.mesh);
  const $quad: Mesh = Quads.ndc(app.buffer, app.mesh);

  DrawShader.init(app.shader); // Shader that draws a brush over a line segment
  const $mat_draw: Material = app.shader.new_material('DrawShader');

  PostShader.init(app.shader); // Shader that uses a unit quad to draw a texture to screen
  let $mat_post: Material = app.shader.new_material('PostRender');

  let $brush_size = 10;
  let $bound = new Float32Array(4); // Bounding Area to Draw
  let $segment = new Float32Array(4); // The 2 points of a Segment

  // This function handles drawing the brush shader onto a custom frame buffer texture
  function draw(pressure: number) {
    let c = app.gl.ctx; // alias

    // Setup
    app.fbo.bind(app.main_fbo); //.clear( $fbo );	// Load Custom FrameBuffer
    c.bindVertexArray($brush.vao?.id); // Load Quad

    //App.gl.ctx.disable( App.gl.ctx.DEPTH_TEST );

    // Experiment with Blending Modes to get something that works well
    c['enable'](c.BLEND);
    //c.blendFunc( c.ONE, c.ONE ); //BLEND_ADDITIVE
    c.blendFunc(c.SRC_ALPHA, c.ONE); // BLEND_ALPHA_ADDITIVE
    //c.blendFunc( c.ONE, c.ZERO ); // BLEND_OVERRIDE
    //c.blendFunc( c.SRC_ALPHA, c.ONE_MINUS_SRC_ALPHA ); //BLEND_ALPHA

    // Load Shader and update uniforms
    c.useProgram($mat_draw.shader.program);
    c.uniformMatrix4fv(
      $mat_draw.uniforms.get('ortho').loc,
      false,
      app.ortho_proj
    );
    //c.uniform2fv( $mat_draw.uniforms.get( "move" ).loc, $move );
    c.uniform1f(
      $mat_draw.uniforms.get('brush_size').loc,
      $brush_size * pressure
    );
    c.uniform4fv($mat_draw.uniforms.get('bound').loc, $bound);
    c.uniform4fv($mat_draw.uniforms.get('segment').loc, $segment);

    // Draw
    c.drawElements(app.mesh.TRI, $brush.element_cnt, $brush.element_type, 0);

    // Cleanup
    c.useProgram(null);
    c.bindVertexArray(null);
  }

  // This function handles rendering the custom frame buffer texture to the screen
  function render() {
    app.fbo.unbind(); // Unbind any Custom Frame Buffer
    app.gl.clear(); // Clear Screen Buffer
    let c = app.gl.ctx; // Alias

    // Mesh
    c.bindVertexArray($quad.vao?.id);

    // SHADER
    c.useProgram($mat_post.shader.program); // Bind Shader
    c.activeTexture(c.TEXTURE0); // Turn on Texture Slot
    c.bindTexture(c.TEXTURE_2D, app.main_fbo.buffers.color.id); // Bind Texture
    c.uniform1i($mat_post.uniforms.get('buf_color').loc, 0); // Set Uniform Loc to Texture Slot

    // Draw
    c.drawElements(app.mesh.TRI, $quad.element_cnt, $quad.element_type, 0);

    // Cleanup
    c.useProgram(null);
    c.bindVertexArray(null);
  }

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
    x_min = Math.max(x_min - $brush_size, 0);
    y_min = Math.max(y_min - $brush_size, 0);
    x_max += $brush_size;
    y_max += $brush_size;

    $bound[0] = x_min; // Position (XY)
    $bound[1] = y_min;
    $bound[2] = x_max - x_min; // Scale (W/H)
    $bound[3] = y_max - y_min;

    $segment[0] = prev[0]; // Segment Point A
    $segment[1] = prev[1];
    $segment[2] = move[0]; // Segment Point B
    $segment[3] = move[1];
  }

  return canvas;
}
