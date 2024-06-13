export const hexToRgb = (hex: string) => {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  return [r, g, b] as [number, number, number];
};

export const rgbToHex = (rgb: [number, number, number]) => {
  let r = rgb[0].toString(16).padStart(2, '0');
  let g = rgb[1].toString(16).padStart(2, '0');
  let b = rgb[2].toString(16).padStart(2, '0');

  return '#' + r + g + b;
};

export const rgbToNormalized = (rgb: [number, number, number]) => {
  let r = rgb[0] / 255;
  let g = rgb[1] / 255;
  let b = rgb[2] / 255;

  return [r, g, b] as [number, number, number];
};

export const normalizedToRgb = (normalized: [number, number, number]) => {
  let r = Math.round(normalized[0] * 255);
  let g = Math.round(normalized[1] * 255);
  let b = Math.round(normalized[2] * 255);

  return [r, g, b] as [number, number, number];
};
