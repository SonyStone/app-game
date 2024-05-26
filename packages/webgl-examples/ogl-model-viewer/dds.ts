import { GL_INTERNAL_FORMAT } from '@packages/webgl/static-variables/textures';

// Getted from three.js DDSLoader
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/loaders/DDSLoader.js
// Adapted from @toji's DDS utils
// https://github.com/toji/webgl-texture-utils/blob/master/texture-util/dds.js

// DXGI_FORMAT enum
// https://github.com/apitrace/dxsdk/blob/master/Include/dxgiformat.h

const RGB_BPTC_SIGNED_Format = 36494;
const RGB_BPTC_UNSIGNED_Format = 36495;

// All values and structures referenced from:
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
const DDS_MAGIC = 0x20534444;

const DDSD_CAPS = 0x1;
const DDSD_HEIGHT = 0x2;
const DDSD_WIDTH = 0x4;
const DDSD_PITCH = 0x8;
const DDSD_PIXELFORMAT = 0x1000;
const DDSD_MIPMAPCOUNT = 0x20000;
const DDSD_LINEARSIZE = 0x80000;
const DDSD_DEPTH = 0x800000;

const DDSCAPS_COMPLEX = 0x8;
const DDSCAPS_MIPMAP = 0x400000;
const DDSCAPS_TEXTURE = 0x1000;

const DDSCAPS2_CUBEMAP = 0x200;
const DDSCAPS2_CUBEMAP_POSITIVEX = 0x400;
const DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800;
const DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000;
const DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000;
const DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000;
const DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000;
const DDSCAPS2_VOLUME = 0x200000;

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_ALPHA = 0x2;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDPF_YUV = 0x200;
const DDPF_LUMINANCE = 0x20000;

const DXGI_FORMAT_BC6H_UF16 = 95;
const DXGI_FORMAT_BC6H_SF16 = 96;
const DXGI_FORMAT_BC7_UNORM = 98;
const DXGI_FORMAT_BC7_UNORM_SRGB = 99;

function fourCCToInt32(value: string) {
  return value.charCodeAt(0) + (value.charCodeAt(1) << 8) + (value.charCodeAt(2) << 16) + (value.charCodeAt(3) << 24);
}

function Int32ToFourCC(value: number) {
  return String.fromCharCode(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
}

const FOURCC_DXT1 = fourCCToInt32('DXT1');
const FOURCC_DXT3 = fourCCToInt32('DXT3');
const FOURCC_DXT5 = fourCCToInt32('DXT5');
const FOURCC_ETC1 = fourCCToInt32('ETC1');
const FOURCC_DX10 = fourCCToInt32('DX10');

const HEADER_LENGTH_INT = 31; // The header length in 32 bit ints
const EXTENDED_HEADER_LENGTH_INT = 5; // The extended header length in 32 bit ints

// Offsets into the header array
const OFF_MAGIC = 0;
const OFF_SIZE = 1;
const OFF_FLAGS = 2;
const OFF_HEIGHT = 3;
const OFF_WIDTH = 4;
const OFF_MIPMAPCOUNT = 7;

const OFF_PF_FLAGS = 20;
const OFF_PF_FOURCC = 21;

// If fourCC = DX10, the extended header starts after 32
const OFF_DXGI_FORMAT = 0;

// Little reminder for myself where the above values come from
/*
DDS_PIXELFORMAT {
    int32 dwSize; // offset: 19
    int32 dwFlags;
    char[4] dwFourCC;
    int32 dwRGBBitCount;
    int32 dwRBitMask;
    int32 dwGBitMask;
    int32 dwBBitMask;
    int32 dwABitMask; // offset: 26
};

DDS_HEADER {
    int32 dwSize; // 1
    int32 dwFlags; 
    int32 dwHeight;
    int32 dwWidth;
    int32 dwPitchOrLinearSize;
    int32 dwDepth;
    int32 dwMipMapCount; // offset: 7
    int32[11] dwReserved1;
    DDS_PIXELFORMAT ddspf; // offset 19
    int32 dwCaps; // offset: 27
    int32 dwCaps2;
    int32 dwCaps3;
    int32 dwCaps4;
    int32 dwReserved2; // offset 31
};
*/

export function loadDDSLevels(gl: WebGLRenderingContext, buffer: ArrayBuffer, loadMipmaps: boolean = true) {
  const dds: {
    mipmaps: {
      data: Uint8Array;
      width: number;
      height: number;
    }[];
    width: number;
    height: number;
    format: GL_INTERNAL_FORMAT | any;
    mipmapCount: number;
  } = { mipmaps: [], width: 0, height: 0, format: null, mipmapCount: 1 };

  const header = new Int32Array(buffer, 0, HEADER_LENGTH_INT);

  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc')!;
  const bptc = gl.getExtension('EXT_texture_compression_bptc')!;

  const ddsMagic = header[OFF_MAGIC];

  if (ddsMagic !== DDS_MAGIC) {
    console.error('Invalid magic number in DDS header');
    return undefined;
  }

  const pfFlags = header[OFF_PF_FLAGS];

  if (pfFlags !== DDPF_FOURCC) {
    console.error('Unsupported format, must contain a FourCC code');
    return undefined;
  }

  const fourCC = header[OFF_PF_FOURCC];
  let width = header[OFF_WIDTH];
  let height = header[OFF_HEIGHT];

  dds.width = width;
  dds.height = height;

  let dataOffset = header[OFF_SIZE] + 4;

  const { blockBytes, internalFormat } = (() => {
    switch (fourCC) {
      case FOURCC_DXT1:
        return {
          blockBytes: 8,
          internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT
        };

      case FOURCC_DXT5:
        return {
          blockBytes: 16,
          internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT
        };

      case FOURCC_DX10:
        dataOffset += EXTENDED_HEADER_LENGTH_INT * 4;
        const extendedHeader = new Int32Array(buffer, (HEADER_LENGTH_INT + 1) * 4, EXTENDED_HEADER_LENGTH_INT);
        const dxgiFormat = extendedHeader[OFF_DXGI_FORMAT];
        switch (dxgiFormat) {
          case DXGI_FORMAT_BC6H_SF16: {
            return {
              blockBytes: 16,
              internalFormat: bptc.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT
            };
          }
          case DXGI_FORMAT_BC6H_UF16: {
            return {
              blockBytes: 16,
              internalFormat: bptc.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT
            };
          }
          case DXGI_FORMAT_BC7_UNORM: {
            return {
              blockBytes: 16,
              internalFormat: bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT
            };
          }
          case DXGI_FORMAT_BC7_UNORM_SRGB: {
            return {
              blockBytes: 16,
              internalFormat: bptc.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT
            };
          }

          default: {
            console.error('Unsupported DXGI_FORMAT code ', dxgiFormat);

            return {
              blockBytes: 0,
              internalFormat: 0
            };
          }
        }
      default:
        console.error('Unsupported FourCC code:', Int32ToFourCC(fourCC));
        return {
          blockBytes: 0,
          internalFormat: 0
        };
    }
  })();

  dds.format = internalFormat;

  const mipmapCount = (() => {
    let mipmapCount = 1;
    if (header[OFF_FLAGS] & DDSD_MIPMAPCOUNT && loadMipmaps !== false) {
      mipmapCount = Math.max(1, header[OFF_MIPMAPCOUNT]);
    }
    return mipmapCount;
  })();

  dds.mipmapCount = mipmapCount;

  for (let i = 0; i < mipmapCount; ++i) {
    let dataLength = (((Math.max(4, width) / 4) * Math.max(4, height)) / 4) * blockBytes;
    const byteArray = new Uint8Array(buffer, dataOffset, dataLength);
    const mipmap = { data: byteArray, width, height };
    dds.mipmaps.push(mipmap);
    dataOffset += dataLength;
    width *= 0.5;
    height *= 0.5;
  }

  return dds;
}
