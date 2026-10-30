import type { PsdColorSettings } from '@app-game/psd/viewer';
import { createGrayProfile } from './grayProfile';
import srgbUrl from './profiles/srgb.icc?url';
import { loadWorkingCmyk } from './workingCmyk';

/** Modes qualified by the batch-20 dither-off browser-sRGB display measurement. */
export function usesConfiguredDisplay(mode: number): boolean {
  return mode === 4 || mode === 8 || mode === 9;
}

/** Loads original Gray and sRGB profiles plus the user's local CMYK working space. Embedded profiles take priority. */
export async function displayColor(): Promise<PsdColorSettings> {
  const srgb = await (pending ??= profile(srgbUrl, 'srgb.icc'));
  const working = await loadWorkingCmyk();
  return { srgb, workingRgb: srgb, workingGray: createGrayProfile(), workingCmyk: working?.bytes, dither: false };
}

let pending: Promise<Uint8Array> | undefined;

async function profile(url: string, filename: string): Promise<Uint8Array> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const fs = await import(/* @vite-ignore */ 'node:fs/promises');
    return new Uint8Array(await fs.readFile(new URL(`./profiles/${filename}`, import.meta.url)));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Display profile could not load: ${filename}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
