import { d, std } from 'typegpu';

/** PDF blend function on straight RGB. Alpha compositing is applied separately by the caller. */
export function blendColor(backdrop: d.v3f, source: d.v3f, mode: number): d.v3f {
  'use gpu';

  if (mode === 14) {
    return setLuminosity(setSaturation(source, saturation(backdrop)), luminosity(backdrop));
  }

  if (mode === 15) {
    return setLuminosity(setSaturation(backdrop, saturation(source)), luminosity(backdrop));
  }

  if (mode === 16) {
    return setLuminosity(source, luminosity(backdrop));
  }

  if (mode === 17) {
    return setLuminosity(backdrop, luminosity(source));
  }

  return d.vec3f(
    blendChannel(backdrop.r, source.r, mode),
    blendChannel(backdrop.g, source.g, mode),
    blendChannel(backdrop.b, source.b, mode)
  );
}

function blendChannel(backdrop: number, source: number, mode: number) {
  'use gpu';

  if (mode === 1) {
    return backdrop * source;
  }

  if (mode === 4) {
    return backdrop + source - backdrop * source;
  }

  if (mode === 5) {
    return hardLight(source, backdrop);
  }

  if (mode === 6) {
    return std.min(backdrop, source);
  }

  if (mode === 7) {
    return std.max(backdrop, source);
  }

  if (mode === 8) {
    if (backdrop === 0) {
      return d.f32(0);
    }

    if (source === 1) {
      return d.f32(1);
    }

    return std.min(1, backdrop / (1 - source));
  }

  if (mode === 9) {
    if (backdrop === 1) {
      return d.f32(1);
    }

    if (source === 0) {
      return d.f32(0);
    }

    return 1 - std.min(1, (1 - backdrop) / source);
  }

  if (mode === 10) {
    return hardLight(backdrop, source);
  }

  if (mode === 11) {
    if (source <= 0.5) {
      return backdrop - (1 - 2 * source) * backdrop * (1 - backdrop);
    }

    let curve = std.sqrt(backdrop);

    if (backdrop <= 0.25) {
      curve = ((16 * backdrop - 12) * backdrop + 4) * backdrop;
    }

    return backdrop + (2 * source - 1) * (curve - backdrop);
  }

  if (mode === 12) {
    return std.abs(backdrop - source);
  }

  if (mode === 13) {
    return backdrop + source - 2 * backdrop * source;
  }

  return source;
}

function hardLight(backdrop: number, source: number) {
  'use gpu';

  if (source <= 0.5) {
    return 2 * backdrop * source;
  }

  return 1 - 2 * (1 - backdrop) * (1 - source);
}

function luminosity(color: d.v3f) {
  'use gpu';
  return std.dot(color, d.vec3f(0.3, 0.59, 0.11));
}

function saturation(color: d.v3f) {
  'use gpu';
  return std.max(color.r, std.max(color.g, color.b)) - std.min(color.r, std.min(color.g, color.b));
}

function setSaturation(color: d.v3f, value: number) {
  'use gpu';
  const minimum = std.min(color.r, std.min(color.g, color.b));
  const range = saturation(color);

  if (range === 0) {
    return d.vec3f(0);
  }

  return std.mul(std.sub(color, d.vec3f(minimum)), value / range);
}

function setLuminosity(color: d.v3f, value: number) {
  'use gpu';
  let result = std.add(color, d.vec3f(value - luminosity(color)));
  const low = std.min(result.r, std.min(result.g, result.b));
  const high = std.max(result.r, std.max(result.g, result.b));

  if (low < 0) {
    result = std.add(d.vec3f(value), std.mul(std.sub(result, d.vec3f(value)), value / (value - low)));
  }

  if (high > 1) {
    result = std.add(d.vec3f(value), std.mul(std.sub(result, d.vec3f(value)), (1 - value) / (high - value)));
  }

  return result;
}
