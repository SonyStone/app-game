const RE_HEX = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const RE_HEXA = /^#?([A-Fa-f0-9]{8}|[A-Fa-f0-9]{4})$/;

export const hex2rgb = (hex: `#${string}`) => {
  let normalizedHex = hex;

  if (hex.match(RE_HEX)) {
    // remove optional leading #
    if (normalizedHex.length === 4 || normalizedHex.length === 7) {
      normalizedHex = normalizedHex.slice(1) as `#${string}`;
    }
    // expand short-notation to full six-digit
    if (normalizedHex.length === 3) {
      const [r, g, b] = normalizedHex.split('');
      normalizedHex = `${r}${r}${g}${g}${b}${b}` as `#${string}`;
    }
    const u = parseInt(normalizedHex, 16);
    const r = u >> 16;
    const g = (u >> 8) & 0xff;
    const b = u & 0xff;
    return [r, g, b, 1] as [number, number, number, number];
  }

  // match rgba hex format, eg #FF000077
  if (hex.match(RE_HEXA)) {
    if (normalizedHex.length === 5 || normalizedHex.length === 9) {
      // remove optional leading #
      normalizedHex = normalizedHex.slice(1) as `#${string}`;
    }
    // expand short-notation to full eight-digit
    if (normalizedHex.length === 4) {
      const [r, g, b, a] = normalizedHex.split('');
      normalizedHex = `${r}${r}${g}${g}${b}${b}${a}${a}` as `#${string}`;
    }
    const u = parseInt(normalizedHex, 16);
    const r = (u >> 24) & 0xff;
    const g = (u >> 16) & 0xff;
    const b = (u >> 8) & 0xff;
    const a = Math.round(((u & 0xff) / 0xff) * 100) / 100;
    return [r, g, b, a] as [number, number, number, number];
  }

  // we used to check for css colors here
  // if _input.css? and rgb = _input.css hex
  //     return rgb

  throw new Error(`unknown hex color: ${hex}`);
};
