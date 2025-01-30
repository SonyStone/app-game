import { createProgram } from '@packages/webgl/createProgram';
import { createWebGL2Context } from '@packages/webgl/webgl-objects/context';
import { onMount } from 'solid-js';
import { GLTileCanvas } from './GLTileCanvas';
import fragmentShaderSource from './tiles.frag?raw';
import vertexShaderSource from './tiles.vert?raw';

export default function TileBasedCanvas() {
  const canvas = (
    <canvas id="canvas" class="touch-none border border-black" width="800" height="600" />
  ) as HTMLCanvasElement;

  onMount(() => {
    const gl = createWebGL2Context(canvas);

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);

    // Retrieve attribute/uniform locations
    const aPositionLoc = gl.getAttribLocation(program, 'a_position');
    const aTexCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
    const uCanvasSizeLoc = gl.getUniformLocation(program, 'u_canvasSize');
    const uTileOffsetLoc = gl.getUniformLocation(program, 'u_tileOffset');
    const uTileSizeLoc = gl.getUniformLocation(program, 'u_tileSize');
    const uTextureLoc = gl.getUniformLocation(program, 'u_texture');

    // Create a small rectangle in local tile space, for example:
    // [0,0], [tileSize,0], [tileSize,tileSize], [0,tileSize]
    // We'll set the actual tile size via a uniform or by calculating dynamic attributes.
    // prettier-ignore
    const positions = new Float32Array([
    // x, y,   texU, texV
       0, 0,   0, 0,
       1, 0,   1, 0,
       1, 1,   1, 1,
       0, 1,   0, 1,
    ]);

    // Indices to draw two triangles
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    // Position/UV buffer
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Enable and set up a_position (vec2)
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 4 * 4, 0);

    // Enable and set up a_texCoord (vec2)
    gl.enableVertexAttribArray(aTexCoordLoc);
    gl.vertexAttribPointer(aTexCoordLoc, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

    gl.bindVertexArray(null);

    const tiles = new GLTileCanvas(gl, 800, 600, 32);

    tiles.renderTiles(program, vao);
  });

  return (
    <>
      <div>TileBasedCanvas</div>
      {canvas}
    </>
  );
}
