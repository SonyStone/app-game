import { Texture } from '../core/texture';
import type { OGLRenderingContext } from '../core/renderer';
import { KTXTexture } from './KTX-texture';

// For compressed textures, generate using https://github.com/TimvanScherpenzeel/texture-compressor

type TextureSource = string | Record<string, string>;

type TextureLoaderOptions = {
  src?: TextureSource;
  wrapS?: GLenum;
  wrapT?: GLenum;
  anisotropy?: number;
  format?: GLenum;
  internalFormat?: GLenum;
  generateMipmaps?: boolean;
  minFilter?: GLenum;
  magFilter?: GLenum;
  premultiplyAlpha?: boolean;
  unpackAlignment?: number;
  flipY?: boolean;
};

let cache: Record<string, Texture | KTXTexture> = {};
const supportedExtensions: string[] = [];

export class TextureLoader {
  static load(
    gl: OGLRenderingContext,
    {
      src, // string or object of extension:src key-values
      // {
      //     pvrtc: '...ktx',
      //     s3tc: '...ktx',
      //     etc: '...ktx',
      //     etc1: '...ktx',
      //     astc: '...ktx',
      //     webp: '...webp',
      //     jpg: '...jpg',
      //     png: '...png',
      // }

      // Only props relevant to KTXTexture
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      anisotropy = 0,

      // For regular images
      format,
      internalFormat,
      generateMipmaps,
      minFilter,
      magFilter = gl.LINEAR,
      premultiplyAlpha = false,
      unpackAlignment = 4,
      flipY = true
    }: TextureLoaderOptions = {}
  ): Texture | KTXTexture {
    const support = this.getSupportedExtensions(gl);
    const resolvedFormat = format ?? gl.RGBA;
    const resolvedInternalFormat = internalFormat ?? resolvedFormat;
    const resolvedGenerateMipmaps = generateMipmaps ?? true;
    const resolvedMinFilter = minFilter ?? (resolvedGenerateMipmaps ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR);
    let ext = 'none';
    let resolvedSrc = src;

    // If src is string, determine which format from the extension
    if (typeof resolvedSrc === 'string') {
      ext = resolvedSrc.split('.').pop()?.split('?')[0].toLowerCase() ?? 'none';
    }

    // If src is object, use supported extensions and provided list to choose best option
    // Get first supported match, so put in order of preference
    if (resolvedSrc && typeof resolvedSrc === 'object') {
      for (const prop in resolvedSrc) {
        if (support.includes(prop.toLowerCase())) {
          ext = prop.toLowerCase();
          resolvedSrc = resolvedSrc[prop];
          break;
        }
      }
    }

    // Stringify props
    const cacheID =
      String(resolvedSrc ?? '') +
      wrapS +
      wrapT +
      anisotropy +
      resolvedFormat +
      resolvedInternalFormat +
      resolvedGenerateMipmaps +
      resolvedMinFilter +
      magFilter +
      premultiplyAlpha +
      unpackAlignment +
      flipY +
      gl.renderer.id;

    // Check cache for existing texture
    if (cache[cacheID]) return cache[cacheID];

    let texture;
    switch (ext) {
      case 'ktx':
      case 'pvrtc':
      case 's3tc':
      case 'etc':
      case 'etc1':
      case 'astc':
        // Load compressed texture using KTX format
        texture = new KTXTexture(gl, {
          wrapS,
          wrapT,
          anisotropy,
          minFilter: resolvedMinFilter,
          magFilter
        } as any);
        texture.loaded = this.loadKTX(resolvedSrc as string, texture);
        break;
      case 'webp':
      case 'jpg':
      case 'jpeg':
      case 'png':
        texture = new Texture(gl, {
          wrapS,
          wrapT,
          anisotropy,
          format: resolvedFormat,
          internalFormat: resolvedInternalFormat,
          generateMipmaps: resolvedGenerateMipmaps,
          minFilter: resolvedMinFilter,
          magFilter,
          premultiplyAlpha,
          unpackAlignment,
          flipY
        });
        texture.loaded = this.loadImage(gl, resolvedSrc as string, texture, flipY);
        break;
      default:
        console.warn('No supported format supplied');
        texture = new Texture(gl);
    }

    texture.ext = ext;
    cache[cacheID] = texture;
    return texture;
  }

  static getSupportedExtensions(gl: OGLRenderingContext): string[] {
    if (supportedExtensions.length) return supportedExtensions;

    const extensions = {
      pvrtc:
        gl.renderer.getExtension('WEBGL_compressed_texture_pvrtc') ||
        gl.renderer.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc'),
      s3tc: gl.renderer.getExtension('WEBGL_compressed_texture_s3tc'),
      // etc: gl.renderer.getExtension('WEBGL_compressed_texture_etc'),
      etc1: gl.renderer.getExtension('WEBGL_compressed_texture_etc1'),
      astc: gl.renderer.getExtension('WEBGL_compressed_texture_astc'),
      bc7: gl.renderer.getExtension('EXT_texture_compression_bptc')
    };

    for (const ext in extensions) if (extensions[ext as keyof typeof extensions]) supportedExtensions.push(ext);

    // Formats supported by all
    supportedExtensions.push('png', 'jpg', 'webp');

    return supportedExtensions;
  }

  static loadKTX(src: string, texture: KTXTexture): Promise<Texture> {
    return fetch(src)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        texture.parseBuffer(buffer);
        return texture;
      });
  }

  static loadImage(gl: OGLRenderingContext, src: string, texture: Texture, flipY: boolean): Promise<Texture> {
    return decodeImage(src, flipY).then((imgBmp) => {
      texture.image = imgBmp as any;

      // For createImageBitmap, close once uploaded
      texture.onUpdate = () => {
        if ('close' in imgBmp) imgBmp.close();
        texture.onUpdate = undefined;
      };

      return texture;
    });
  }

  static clearCache() {
    cache = {};
  }
}

function powerOfTwo(value: number): boolean {
  // (width & (width - 1)) !== 0
  return Math.log2(value) % 1 === 0;
}

function decodeImage(src: string, flipY: boolean): Promise<HTMLImageElement | ImageBitmap> {
  return new Promise((resolve) => {
    if (isCreateImageBitmap()) {
      fetch(src, { mode: 'cors' })
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b, { imageOrientation: flipY ? 'flipY' : 'none', premultiplyAlpha: 'none' }))
        .then(resolve);
    } else {
      const img = new Image();

      img.crossOrigin = '';
      img.src = src;
      img.onload = () => resolve(img);
    }
  });
}

function isCreateImageBitmap(): boolean {
  const isChrome = navigator.userAgent.toLowerCase().includes('chrome');
  if (!isChrome) return false;
  try {
    createImageBitmap;
  } catch (e) {
    return false;
  }
  return true;
}
