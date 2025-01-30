export class Tile {
  public xIndex: number;
  public yIndex: number;
  public tileSize: number;
  public dirty: boolean;
  public pixelData: Uint8Array;
  private texture: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext, xIndex: number, yIndex: number, tileSize: number) {
    this.xIndex = xIndex;
    this.yIndex = yIndex;
    this.tileSize = tileSize;
    this.dirty = true;

    // Allocate CPU buffer (RGBA)
    this.pixelData = new Uint8Array(tileSize * tileSize * 4);

    // Create WebGL texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Initialize a blank texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tileSize, tileSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Set up texture filtering/wrapping
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Update a sub-region within the tile
  updateRegion(x: number, y: number, width: number, height: number, data: Uint8Array): void {
    // Copy 'data' into pixelData at the correct offsets
    // data is expected to be width*height*4 in size
    for (let row = 0; row < height; row++) {
      const destOffset = ((y + row) * this.tileSize + x) * 4;
      const srcOffset = row * width * 4;
      this.pixelData.set(data.subarray(srcOffset, srcOffset + width * 4), destOffset);
    }
    this.dirty = true;
  }

  // Upload to GPU if dirty
  uploadToGPU(gl: WebGL2RenderingContext): void {
    if (!this.dirty || !this.texture) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.tileSize, this.tileSize, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelData);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.dirty = false;
  }

  // Bind the texture for rendering
  bindTexture(gl: WebGL2RenderingContext, textureUnit: number): void {
    if (!this.texture) return;
    gl.activeTexture(textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }
}
