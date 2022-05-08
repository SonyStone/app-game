import { createApp, MouseState } from './App';
import DrawShader from './DrawShader';
import { Material } from './fungi/Shader';
import Vec2 from './fungi/Vec2';
import PostShader from './PostShader';
import Quads from './Quads2';

export default function Paint() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none',
      }}></canvas>
  ) as HTMLCanvasElement;

  let $move = new Vec2(); // Current Mouse Pos
  let $prev = new Vec2(); // Previous Mouse Pos
  let $pressure = 0;

  let $brush: any;
  let $quad: any;
  let $mat_draw: Material;
  let $mat_post: Material;

  let $brush_size = 10;
  let $bound = new Float32Array(4); // Bounding Area to Draw
  let $segment = new Float32Array(4); // The 2 points of a Segment

  const app = createApp(canvas, on_mouse)!;
  if (!app) return;

  PostShader.init(app.shader); // Shader that uses a unit quad to draw a texture to screen
  DrawShader.init(app.shader); // Shader that draws a brush over a line segment

  $brush = Quads.unit_corner(app.buffer, app.mesh);
  $quad = Quads.ndc(app.buffer, app.mesh);
  $mat_draw = app.shader.new_material('DrawShader');
  $mat_post = app.shader.new_material('PostRender');

  function on_mouse(state: any, x: number, y: number, pressure: number) {
    $move.setVec(x, y);
    $pressure = pressure;

    switch (state) {
      //case App.MDOWN : break;
      case MouseState.MUP:
      case MouseState.MMOVE:
        // Only render if moved more then one pixel distance.
        if (Vec2.len_sqr($move, $prev) == 0) return;

        compute_draw_bound(); // Compute the Drawing Area
        draw(); // Draw into Custom Frame buffer texture
        render(); // Render Texture to Screen
        break;
    }

    $prev.copy($move);
  }

  // This function handles drawing the brush shader onto a custom frame buffer texture
  function draw() {
    let c = app.gl.ctx; // alias

    // Setup
    app.fbo.bind(app.main_fbo); //.clear( $fbo );	// Load Custom FrameBuffer
    c.bindVertexArray($brush.vao.id); // Load Quad

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
      $brush_size * $pressure
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
    c.bindVertexArray($quad.vao.id);

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
  function compute_draw_bound() {
    let x_min: number;
    let x_max: number;
    let y_min: number;
    let y_max: number;

    // Compute the Min and Max Bounds
    if ($prev[0] < $move[0]) {
      x_min = $prev[0];
      x_max = $move[0];
    } else {
      x_min = $move[0];
      x_max = $prev[0];
    }

    if ($prev[1] < $move[1]) {
      y_min = $prev[1];
      y_max = $move[1];
    } else {
      y_min = $move[1];
      y_max = $prev[1];
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

    $segment[0] = $prev[0]; // Segment Point A
    $segment[1] = $prev[1];
    $segment[2] = $move[0]; // Segment Point B
    $segment[3] = $move[1];
  }

  return canvas;
}
