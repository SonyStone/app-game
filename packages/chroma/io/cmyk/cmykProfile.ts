import * as cms from '@kittl/little-cms';
import { FLAGS_BLACKPOINTCOMPENSATION } from '@kittl/little-cms/flags';
import { TYPE_CMYK_FLT, TYPE_RGB_8 } from '@kittl/little-cms/formats';

/** CMYK ink percentages, converted to encoded sRGB channels in [0,255]. */
export type CmykConverter = (channels: readonly [number, number, number, number]) => readonly [number, number, number];

/** Opens an explicit CMYK ICC profile and owns a relative-colorimetric, black-point-compensated sRGB transform.
 * No source profile is guessed. Float input preserves fractional ink percentages; output is RGB/8.
 * Throws on invalid profiles/channels or after disposal. Call dispose when replacing the profile.
 * wasmUrl is needed by browser bundlers; omit in Node. Initialization is shared across profile instances.
 */
export async function createCmykProfile(bytes: Uint8Array, wasmUrl?: string) {
  // Keep untrusted file sizes bounded before copying data into WASM.
  if (bytes.byteLength < 128 || bytes.byteLength > 16 * 1024 * 1024)
    throw new Error('Choose a valid CMYK ICC profile up to 16 MiB.');
  await initialize(wasmUrl);
  const source = cms.cmsOpenProfileFromMem(bytes).valueOrThrow;
  try {
    if (cms.cmsGetColorSpace(source).valueOrThrow !== cms.IccColorSpaceMap.CMYK)
      throw new Error('This ICC profile is not CMYK. Choose the CMYK working profile used by Photoshop.');
    const destination = cms.cmsCreate_sRGBProfile().valueOrThrow;
    try {
      const transform = cms.cmsCreateTransform(
        source,
        TYPE_CMYK_FLT,
        destination,
        TYPE_RGB_8,
        cms.CmsIntent.RelativeColorimetric,
        FLAGS_BLACKPOINTCOMPENSATION
      ).valueOrThrow;
      const info = cms.cmsGetProfileInfoASCII(source, cms.CmsPrintInfoType.Description, 'en', 'US');
      let disposed = false;
      const floats = new Float32Array(4);
      const input = new Uint8Array(floats.buffer);
      const convert: CmykConverter = (channels) => {
        if (disposed) throw new Error('The CMYK profile has been disposed.');
        if (!channels.every((value) => Number.isFinite(value) && value >= 0 && value <= 100))
          throw new Error('CMYK ink percentages must be finite values between 0 and 100.');
        floats.set(channels);
        const result = cms.cmsDoTransform(transform, input, 1).valueOrThrow;
        return [result[0]!, result[1]!, result[2]!];
      };
      return {
        name: info.value || 'CMYK ICC profile',
        convert,
        /** Idempotently releases the native transform. */
        dispose() {
          if (disposed) return;
          disposed = true;
          cms.cmsDeleteTransform(transform).valueOrThrow;
        }
      };
    } finally {
      cms.cmsCloseProfile(destination).valueOrThrow;
    }
  } finally {
    cms.cmsCloseProfile(source).valueOrThrow;
  }
}

let initialization: Promise<void> | undefined;
function initialize(wasmUrl?: string) {
  return (initialization ??= cms.initWasm(wasmUrl).then((result) => {
    if (result.error) {
      initialization = undefined;
      throw result.error;
    }
  }));
}
