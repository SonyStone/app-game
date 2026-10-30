/** Translates technical presentation qualifications without dropping other renderer diagnostics. */
export function presentationNotice(text: string): string {
  if (text.startsWith('DisplayConversion: legacy RGB16')) {
    return '16-bit RGB is reduced to 8 bits for display. Color profiles and Photoshop’s rounding may produce different colors.';
  }

  if (text.startsWith('DisplayConversion: legacy 32-bit')) {
    return '32-bit HDR uses a preview tone conversion. Color profiles and Photoshop’s display dither are not reproduced.';
  }

  if (text.startsWith('DisplayConversion: legacy Gray')) {
    return 'Grayscale is shown without converting its Gray profile to sRGB. Gamma and Dot Gain settings may change its appearance.';
  }

  if (text.includes('one-sided vector stroke approximated by clipping')) {
    return 'An inside or outside vector stroke uses an approximate outline. Its joins and edges may differ from Photoshop.';
  }

  return text;
}
