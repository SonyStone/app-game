import type { OGLRenderingContext } from '../core/renderer';

let supportedFormat: BasisManagerFormat;
let id = 0;

export type BasisManagerFormat = 'astc' | 'bptc' | 's3tc' | 'etc1' | 'pvrtc' | 'none';

export type BasisImage = (Uint8Array | Uint16Array) & {
  width: number;
  height: number;
  isCompressedTexture: boolean;
  internalFormat: number;
  isBasis: boolean;
};

/**
 * A {@link https://github.com/binomialLLC/basis_universal | Basis Universal GPU Texture} loader.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/BasisManager.js | Source}
 */
export class BasisManager {
  queue: Map<number, (value: BasisImage) => void>;

  worker?: Worker;

  constructor(workerSrc: string | URL, gl?: OGLRenderingContext) {
    if (!supportedFormat) {
      supportedFormat = this.getSupportedFormat(gl);
    }
    this.onMessage = this.onMessage.bind(this);
    this.queue = new Map();
    this.initWorker(workerSrc);
  }

  getSupportedFormat(
    gl: OGLRenderingContext = document.createElement('canvas').getContext('webgl') as any
  ): BasisManagerFormat {
    /* if (!!gl.getExtension('WEBGL_compressed_texture_etc')) {
            return 'etc2';
        } else  */
    if (!!gl.getExtension('WEBGL_compressed_texture_astc')) {
      return 'astc';
    } else if (!!gl.getExtension('EXT_texture_compression_bptc')) {
      return 'bptc';
    } else if (!!gl.getExtension('WEBGL_compressed_texture_s3tc')) {
      return 's3tc';
    } else if (!!gl.getExtension('WEBGL_compressed_texture_etc1')) {
      return 'etc1';
    } else if (
      !!gl.getExtension('WEBGL_compressed_texture_pvrtc') ||
      !!gl.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc')
    ) {
      return 'pvrtc';
      // } else if (!!gl.getExtension('WEBGL_compressed_texture_atc')) {
      //     return 'atc';
    }
    return 'none';
  }

  initWorker(workerSrc: string | URL): void {
    this.worker = new Worker(workerSrc);
    this.worker.onmessage = this.onMessage;
  }

  onMessage({ data }: { data: { id: number; error: string; image: BasisImage } }): void {
    const { id, error, image } = data;
    if (error) {
      console.log(error, id);
      return;
    }
    const textureResolve = this.queue.get(id);
    this.queue.delete(id);
    image.isBasis = true;
    textureResolve!(image);
  }

  parseTexture(buffer: ArrayBuffer): Promise<BasisImage> {
    id++;
    this.worker!.postMessage({
      id,
      buffer,
      supportedFormat
    });
    let textureResolve!: (value: any) => any;
    const promise = new Promise<BasisImage>((res) => (textureResolve = res));
    this.queue.set(id, textureResolve);

    return promise;
  }
}
