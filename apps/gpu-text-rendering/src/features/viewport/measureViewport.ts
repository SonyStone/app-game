/** Computes finite, nonzero framebuffer dimensions with a shared scale to preserve aspect ratio. */
export function measureViewport(
  width: number,
  height: number,
  deviceDpr: number,
  maxDpr: number,
  maxDimension: number
) {
  const css = { width: positive(width), height: positive(height) };
  const limit = Math.floor(positive(maxDimension));
  const dpr = Math.min(positive(deviceDpr), positive(maxDpr), limit / css.width, limit / css.height);
  const pixels = {
    width: Math.max(1, Math.min(limit, Math.round(css.width * dpr))),
    height: Math.max(1, Math.min(limit, Math.round(css.height * dpr)))
  };

  return { css, pixels, dpr };
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
