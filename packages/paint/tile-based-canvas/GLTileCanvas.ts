import { Tile } from './tile';

export class GLTileCanvas {
  private gl: WebGL2RenderingContext;
  private width: number;
  private height: number;
  private tileSize: number;
  private tilesX: number;
  private tilesY: number;
  private tiles: Tile[] = [];

  constructor(gl: WebGL2RenderingContext, width: number, height: number, tileSize: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;

    this.tilesX = Math.ceil(width / tileSize);
    this.tilesY = Math.ceil(height / tileSize);

    // Create tile objects
    for (let ty = 0; ty < this.tilesY; ty++) {
      for (let tx = 0; tx < this.tilesX; tx++) {
        const tile = new Tile(gl, tx, ty, tileSize);
        this.tiles.push(tile);
      }
    }
  }

  // Mark region of the canvas as updated
  public drawStroke(x: number, y: number, w: number, h: number, data: Uint8Array) {
    // This example just takes a bounding-box approach (no actual brush shape logic).
    // data is w*h*4.
    const startTileX = Math.floor(x / this.tileSize);
    const endTileX = Math.floor((x + w - 1) / this.tileSize);
    const startTileY = Math.floor(y / this.tileSize);
    const endTileY = Math.floor((y + h - 1) / this.tileSize);

    for (let tileY = startTileY; tileY <= endTileY; tileY++) {
      for (let tileX = startTileX; tileX <= endTileX; tileX++) {
        // Clip against tile boundaries
        const localX = x - tileX * this.tileSize;
        const localY = y - tileY * this.tileSize;
        const regionWidth = Math.min(w, this.tileSize - localX);
        const regionHeight = Math.min(h, this.tileSize - localY);

        // Extract subdata for the tile
        const subData = new Uint8Array(regionWidth * regionHeight * 4);
        for (let row = 0; row < regionHeight; row++) {
          const srcOffset = row * w * 4;
          const dstOffset = row * regionWidth * 4;
          // Copy row from data into subData
          subData.set(data.subarray(srcOffset, srcOffset + regionWidth * 4), dstOffset);
        }

        // Find tile and update
        const tileIndex = tileY * this.tilesX + tileX;
        if (tileIndex >= 0 && tileIndex < this.tiles.length) {
          this.tiles[tileIndex].updateRegion(localX, localY, regionWidth, regionHeight, subData);
        }
      }
    }
  }

  public renderTiles(program: WebGLProgram, vao: WebGLVertexArrayObject) {
    const gl = this.gl;
    gl.useProgram(program);

    // Set uniform for canvas size
    const uCanvasSizeLoc = gl.getUniformLocation(program, 'u_canvasSize');
    gl.uniform2f(uCanvasSizeLoc, this.width, this.height);

    // Bind the VAO for the quad
    gl.bindVertexArray(vao);

    // For each tile:
    // 1) Upload to GPU if dirty
    // 2) Bind tile texture
    // 3) Set tile offset uniform
    // 4) Draw
    for (const tile of this.tiles) {
      tile.uploadToGPU(gl);

      // Calculate tile offset in px
      const offsetX = tile.xIndex * this.tileSize;
      const offsetY = tile.yIndex * this.tileSize;

      // Set tile offset
      const uTileOffsetLoc = gl.getUniformLocation(program, 'u_tileOffset');
      gl.uniform2f(uTileOffsetLoc, offsetX, offsetY);

      // If you want tile scaling in the vertex shader, set u_tileSize
      const uTileSizeLoc = gl.getUniformLocation(program, 'u_tileSize');
      gl.uniform2f(uTileSizeLoc, this.tileSize, this.tileSize);

      // Bind tile texture to TEXTURE0
      tile.bindTexture(gl, gl.TEXTURE0);
      const uTextureLoc = gl.getUniformLocation(program, 'u_texture');
      gl.uniform1i(uTextureLoc, 0);

      // Draw the quad (2 triangles)
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // Unbind
    gl.bindVertexArray(null);
  }
}
