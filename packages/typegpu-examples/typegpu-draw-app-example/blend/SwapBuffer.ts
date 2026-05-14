import { TgpuRoot } from 'typegpu';
import { RENDER_TARGET_FORMAT } from '../constants';

export interface SwapBufferTexture {
  texture: GPUTexture;
  view: GPUTextureView;
}

/**
 * Ping-pong buffer system for texture accumulation.
 * Used to blend brush strokes with the accumulated canvas.
 */
export class SwapBuffer {
  private _read: SwapBufferTexture;
  private _write: SwapBufferTexture;
  private _width: number;
  private _height: number;

  constructor(
    private readonly root: TgpuRoot,
    width: number,
    height: number
  ) {
    this._width = width;
    this._height = height;
    this._read = this.createTexture(width, height, 'swap-read');
    this._write = this.createTexture(width, height, 'swap-write');
  }

  /**
   * Create a render target texture
   */
  private createTexture(width: number, height: number, label: string): SwapBufferTexture {
    const texture = this.root.device.createTexture({
      label,
      size: [width, height, 1],
      format: RENDER_TARGET_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    const view = texture.createView();
    return { texture, view };
  }

  /**
   * Get the read buffer (current canvas state)
   */
  get read(): SwapBufferTexture {
    return this._read;
  }

  /**
   * Get the write buffer (target for new rendering)
   */
  get write(): SwapBufferTexture {
    return this._write;
  }

  /**
   * Get current dimensions
   */
  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  /**
   * Swap read and write buffers
   */
  swap(): void {
    const temp = this._read;
    this._read = this._write;
    this._write = temp;
  }

  /**
   * Resize buffers if dimensions changed
   */
  resize(width: number, height: number): boolean {
    if (width === this._width && height === this._height) {
      return false;
    }

    // Destroy old textures
    this._read.texture.destroy();
    this._write.texture.destroy();

    // Create new textures
    this._width = width;
    this._height = height;
    this._read = this.createTexture(width, height, 'swap-read');
    this._write = this.createTexture(width, height, 'swap-write');

    return true;
  }

  /**
   * Clear the read buffer with a color
   */
  clearRead(encoder: GPUCommandEncoder, color: [number, number, number, number]): void {
    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._read.view,
          clearValue: { r: color[0], g: color[1], b: color[2], a: color[3] },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    passEncoder.end();
  }

  /**
   * Destroy both buffers
   */
  destroy(): void {
    this._read.texture.destroy();
    this._write.texture.destroy();
  }
}
