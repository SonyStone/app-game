// TODO: delete texture
// TODO: use texSubImage2D for updates (video or when loaded)
// TODO: need? encoding = linearEncoding
// TODO: support non-compressed mipmaps uploads

import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import {
  GL_INTERNAL_FORMAT,
  GL_PIXEL_FORMAT,
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_TARGET,
  GL_TEXTURE_WRAP_MODE
} from '@packages/webgl/static-variables/textures';
import { DEFAULT_TEXTURE_UNITS, OGLRenderingContext, RenderState, TextureUnit } from './renderer';

const emptyPixel = new Uint8Array(4);

let ID = 1 as TextureUnit;

export type CompressedImage = {
  data: Uint8Array;
  width: number;
  height: number;
}[] & {
  isCompressedTexture?: boolean;
};

export type ImageRepresentation =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLImageElement[]
  | ArrayBufferView
  | CompressedImage;

export interface TextureOptions {
  image: ImageRepresentation;
  target: GL_TEXTURE_TARGET;
  type: GL_DATA_TYPE;
  format: GL_PIXEL_FORMAT;
  internalFormat: GL_INTERNAL_FORMAT;
  minFilter: GL_TEXTURE_MIN_FILTER;
  magFilter: GL_TEXTURE_MAG_FILTER;
  wrapS: GL_TEXTURE_WRAP_MODE;
  wrapT: GL_TEXTURE_WRAP_MODE;
  generateMipmaps: boolean;
  premultiplyAlpha: boolean;
  unpackAlignment: number;
  flipY: boolean;
  anisotropy: number;
  level: number;
  width: number;
  height: number;
}

/**
 * A surface, reflection, or refraction map.
 */
export class Texture {
  gl: OGLRenderingContext;
  id: TextureUnit;

  image?: ImageRepresentation;
  target: GL_TEXTURE_TARGET;
  type: GL_DATA_TYPE;
  format: number;
  internalFormat: number;
  minFilter: GL_TEXTURE_MIN_FILTER;
  magFilter: GL_TEXTURE_MAG_FILTER;
  wrapS: GL_TEXTURE_WRAP_MODE;
  wrapT: GL_TEXTURE_WRAP_MODE;
  generateMipmaps: boolean;
  premultiplyAlpha: boolean;
  unpackAlignment: number;
  flipY: boolean;
  anisotropy: number;
  level: number;
  width: number;
  height: number;
  texture: WebGLTexture;

  store: {
    image?: ImageRepresentation | null;
  };

  glState: RenderState;

  state: {
    minFilter: GL_TEXTURE_MIN_FILTER;
    magFilter: GL_TEXTURE_MAG_FILTER;
    wrapS: GL_TEXTURE_WRAP_MODE;
    wrapT: GL_TEXTURE_WRAP_MODE;
    anisotropy: number;
  };

  needsUpdate: boolean = false;
  onUpdate?: () => void;

  // Set from texture loader
  ext?: string;
  name?: string;
  loaded?: Promise<Texture>;

  constructor(
    gl: OGLRenderingContext,
    {
      image,
      target = GL_TEXTURE_TARGET.TEXTURE_2D,
      type = GL_DATA_TYPE.UNSIGNED_BYTE,
      format = GL_PIXEL_FORMAT.RGBA,
      internalFormat = GL_INTERNAL_FORMAT.RGBA,
      wrapS = GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE,
      wrapT = GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE,
      generateMipmaps = true,
      minFilter = generateMipmaps ? GL_TEXTURE_MIN_FILTER.NEAREST_MIPMAP_LINEAR : GL_TEXTURE_MIN_FILTER.LINEAR,
      magFilter = GL_TEXTURE_MAG_FILTER.LINEAR,
      premultiplyAlpha = false,
      unpackAlignment = 4,
      flipY = target == GL_TEXTURE_TARGET.TEXTURE_2D ? true : false,
      anisotropy = 0,
      level = 0,
      width, // used for RenderTargets or Data Textures
      height = width
    }: Partial<TextureOptions> = {}
  ) {
    this.gl = gl;
    // ? possible bug: texture overflow
    this.id = ID++ as TextureUnit;

    this.image = image;
    this.target = target;
    this.type = type;
    this.format = format;
    this.internalFormat = internalFormat;
    this.minFilter = minFilter;
    this.magFilter = magFilter;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.generateMipmaps = generateMipmaps;
    this.premultiplyAlpha = premultiplyAlpha;
    this.unpackAlignment = unpackAlignment;
    this.flipY = flipY;
    this.anisotropy = Math.min(anisotropy, this.gl.renderer.parameters.maxAnisotropy ?? 1);
    this.level = level;
    this.width = width ?? 1;
    this.height = height ?? 1;
    this.texture = this.gl.createTexture()!;

    this.store = {
      image: null
    };

    // Alias for state store to avoid redundant calls for global state
    this.glState = this.gl.renderer.state;

    // State store to avoid redundant calls for per-texture state
    this.state = {
      minFilter: this.gl.NEAREST_MIPMAP_LINEAR,
      magFilter: this.gl.LINEAR,
      wrapS: this.gl.REPEAT,
      wrapT: this.gl.REPEAT,
      anisotropy: 0
    };
  }

  bind(): void {
    // Already bound to active texture unit
    if (this.glState.textureUnits[this.glState.activeTextureUnit] === this.id) {
      return;
    }
    this.gl.bindTexture(this.target, this.texture);
    this.glState.textureUnits[this.glState.activeTextureUnit] = this.id;
  }

  update(textureUnit: TextureUnit = DEFAULT_TEXTURE_UNITS): void {
    const needsUpdate = !(this.image === this.store.image && !this.needsUpdate);

    // Make sure that texture is bound to its texture unit
    if (needsUpdate || this.glState.textureUnits[textureUnit] !== this.id) {
      // set active texture unit to perform texture functions
      this.gl.renderer.activeTexture(textureUnit);
      this.bind();
    }

    if (!needsUpdate) return;
    this.needsUpdate = false;

    if (this.flipY !== this.glState.flipY) {
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
      this.glState.flipY = this.flipY;
    }

    if (this.premultiplyAlpha !== this.glState.premultiplyAlpha) {
      this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
      this.glState.premultiplyAlpha = this.premultiplyAlpha;
    }

    if (this.unpackAlignment !== this.glState.unpackAlignment) {
      this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, this.unpackAlignment);
      this.glState.unpackAlignment = this.unpackAlignment;
    }

    if (this.minFilter !== this.state.minFilter) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_MIN_FILTER, this.minFilter);
      this.state.minFilter = this.minFilter;
    }

    if (this.magFilter !== this.state.magFilter) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_MAG_FILTER, this.magFilter);
      this.state.magFilter = this.magFilter;
    }

    if (this.wrapS !== this.state.wrapS) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.wrapS);
      this.state.wrapS = this.wrapS;
    }

    if (this.wrapT !== this.state.wrapT) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.wrapT);
      this.state.wrapT = this.wrapT;
    }

    if (this.anisotropy && this.anisotropy !== this.state.anisotropy) {
      this.gl.texParameterf(
        this.target,
        (this.gl.renderer.getExtension('EXT_texture_filter_anisotropic') as any).TEXTURE_MAX_ANISOTROPY_EXT,
        this.anisotropy
      );
      this.state.anisotropy = this.anisotropy;
    }

    if (this.image) {
      if ((this.image as HTMLImageElement).width) {
        this.width = (this.image as HTMLImageElement).width;
        this.height = (this.image as HTMLImageElement).height;
      }

      if (this.target === this.gl.TEXTURE_CUBE_MAP) {
        // For cube maps
        for (let i = 0; i < 6; i++) {
          this.gl.texImage2D(
            this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            this.level,
            this.internalFormat,
            this.format,
            this.type,
            (this.image as TexImageSource[])[i]
          );
        }
      } else if (ArrayBuffer.isView(this.image)) {
        // Data texture
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.width,
          this.height,
          0,
          this.format,
          this.type,
          this.image
        );
      } else if ((this.image as CompressedImage).isCompressedTexture) {
        // Compressed texture
        for (let level = 0; level < (this.image as CompressedImage).length; level++) {
          this.gl.compressedTexImage2D(
            this.target,
            level,
            this.internalFormat,
            (this.image as CompressedImage)[level].width,
            (this.image as CompressedImage)[level].height,
            0,
            (this.image as CompressedImage)[level].data
          );
        }
      } else {
        // Regular texture
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.format,
          this.type,
          this.image as TexImageSource
        );
      }

      if (this.generateMipmaps) {
        this.gl.generateMipmap(this.target);
      }

      // Callback for when data is pushed to GPU
      this.onUpdate && this.onUpdate();
    } else {
      if (this.target === this.gl.TEXTURE_CUBE_MAP) {
        // Upload empty pixel for each side while no image to avoid errors while image or video loading
        for (let i = 0; i < 6; i++) {
          this.gl.texImage2D(
            this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            0,
            this.gl.RGBA,
            1,
            1,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            emptyPixel
          );
        }
      } else if (this.width) {
        // image intentionally left null for RenderTarget
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.width,
          this.height,
          0,
          this.format,
          this.type,
          null
        );
      } else {
        // Upload empty pixel if no image to avoid errors while image or video loading
        this.gl.texImage2D(this.target, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, emptyPixel);
      }
    }
    this.store.image = this.image;
  }
}
