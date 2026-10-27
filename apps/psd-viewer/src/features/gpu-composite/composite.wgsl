// Byte equations from psd-rs blend.rs, composite/pixel.rs and Renderer::collapses.
// All color/alpha arithmetic stays in signed integers. Only the final texture copy uses UNORM storage.
struct Params {
  width: u32, height: u32, stride: u32, gamma: u32,
  left: i32, top: i32, sourceWidth: u32, sourceHeight: u32,
  mode: u32, opacity: i32, fill: i32, density: i32,
  operation: u32, staged: u32, adjustment: u32, threshold: i32,
}
@group(0) @binding(0) var<storage, read> samples: array<vec2u>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> p: Params;
@group(0) @binding(3) var<storage, read> tables: array<i32>;

@group(0) @binding(4) var<storage, read_write> scratch: array<vec2u>;

@group(0) @binding(5) var<storage, read> groupInput: array<u32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if id.x >= p.sourceWidth || id.y >= p.sourceHeight {
    return;
  }
  let x = i32(id.x) + p.left;
  let y = i32(id.y) + p.top;
  if x < 0 || y < 0 || x >= i32(p.width) || y >= i32(p.height) {
    return;
  }
  let sample = samples[id.y * p.sourceWidth + id.x];
  var s = unpack(sample.x);
  var shape = mul(s.a, 255 - mul(255 - i32(sample.y), p.density));
  let at = u32(y) * p.stride + u32(x);
  if p.operation == 1u {
    scratch[at] = vec2u(pack(vec4i(s.rgb, 255)), u32(shape));
    return;
  }
  var b = unpack(output[at]);
  if p.operation == 2u {
    b = unpack(scratch[at].x);
  }
  if p.operation == 3u {
    s = unpack(scratch[at].x);
    shape = i32(scratch[at].y);
  }
  if p.operation == 4u {
    s = unpack(groupInput[at]);
    shape = mul(s.a, 255 - mul(255 - i32(sample.y), p.density));
  }
  if p.operation == 5u {
    let coverage = mul(255 - mul(255 - i32(sample.y), p.density), p.opacity);
    if b.a == 0 || coverage == 0 {
      return;
    }
    var adjusted = vec3i(0);
    if p.adjustment == 2u {
      let luminance = (4915 * b.r + 9667 * b.g + 1802 * b.b + 8192) >> 14;
      adjusted = vec3i(select(0, 255, luminance >= p.threshold));
    } else {
      let offset = p.sourceWidth * p.sourceHeight;
      adjusted = vec3i(i32(samples[offset + u32(b.r)].x), i32(samples[offset + 256u + u32(b.g)].x), i32(samples[offset + 512u + u32(b.b)].x));
    }
    let blended = vec3i(fill_blend(b.r, adjusted.r, p.fill, p.mode), fill_blend(b.g, adjusted.g, p.fill, p.mode), fill_blend(b.b, adjusted.b, p.fill, p.mode));
    output[at] = pack(vec4i(mix_byte(b.r, blended.r, coverage), mix_byte(b.g, blended.g, coverage), mix_byte(b.b, blended.b, coverage), b.a));
    return;
  }
  var result = b;
  if p.gamma == 0u && p.staged == 0u && p.operation != 3u && !special(p.mode) {
    result = paint(b, s.rgb, mul(shape, mul(p.fill, p.opacity)), p.mode);
  }
  else if p.operation == 4u && p.gamma == 0u {
    result = interpolate(b, interpolate(b, paint(b, s.rgb, p.fill, p.mode), shape), p.opacity);
  }
  else if shape != 0 && p.opacity != 0 {
    result = interpolate(b, paint(b, s.rgb, p.fill, p.mode), mul(shape, p.opacity));
  }
  if p.operation == 2u {
    scratch[at].x = pack(result);
  } else {
    output[at] = pack(result);
  }
}

fn floor_div(n: i32, den: i32) -> i32 {
  if n >= 0 {
    return n / den;
  }
  return -((-n + den - 1) / den);
}
fn rd(n: i32, den: i32) -> i32 {
  return floor_div(2 * n + den, 2 * den);
}
fn mul(a: i32, b: i32) -> i32 {
  let product = a * b;
  if product < 0 {
    return -((-product + 127) / 255);
  }
  return (product + 127) / 255;
}
fn norm(part: i32, total: i32) -> i32 {
  return min(255, rd(255 * part, max(total, 1)));
}
fn lerp(b: i32, s: i32, w: i32) -> i32 {
  return b + rd((s - b) * w, 255);
}
fn mix_byte(b: i32, s: i32, w: i32) -> i32 {
  if p.gamma == 0u || w == 0 || w == 255 {
    return lerp(b, s, w);
  }
  let offset = select(0, 4609, p.gamma == 2u);
  let decoded = tables[offset + b];
  let delta = tables[offset + s] - decoded;
  let v = decoded + sign(delta) * ((abs(delta) * w + 127) / 255);
  let index = v >> 3;
  let lo = tables[offset + 256 + index];
  let hi = tables[offset + 256 + min(index + 1, 4096)];
  let encoded = lo + floor_div((hi - lo) * (v & 7) + 4, 8);
  return (encoded * 255 + 16384) >> 15;
}
fn burn(b: i32, s: i32) -> i32 {
  if s == 0 {
    return select(0, 255, b == 255);
  }
  return 255 - min(255, rd((255 - b) * 255, s));
}
fn dodge(b: i32, s: i32) -> i32 {
  if s == 255 {
    return select(255, 0, b == 0);
  }
  return min(255, rd(b * 255, 255 - s));
}
fn screen(b: i32, s: i32) -> i32 {
  return 255 - mul(255 - b, 255 - s);
}
fn low(s: i32) -> i32 {
  return rd(255 * s, 128);
}
fn high(s: i32) -> i32 {
  return rd(255 * (s - 128), 127);
}
fn special(mode: u32) -> bool {
  return mode == 5u || mode == 6u || mode == 7u || mode == 8u || mode == 12u || mode == 13u || mode == 15u || mode == 16u;
}
fn blend(b: i32, s: i32, mode: u32) -> i32 {
  switch mode {
    case 1u: {
      return min(b, s);
    }
    case 2u: {
      return max(b, s);
    }
    case 3u: {
      return mul(b, s);
    }
    case 4u: {
      return screen(b, s);
    }
    case 5u: {
      return burn(b, s);
    }
    case 6u: {
      return max(0, b + s - 255);
    }
    case 7u: {
      return dodge(b, s);
    }
    case 8u: {
      return min(255, b + s);
    }
    case 9u: {
      if b < 128 {
        return mul(s, 2 * b);
      }
      return 255 - mul(255 - s, 2 * (255 - b));
    }
    case 10u: {
      if s < 128 {
        return b - mul(255 - 2 * s, mul(b, 255 - b));
      }
      return b + mul(2 * s - 256, tables[4353 + b] - b);
    }
    case 11u: {
      if s < 128 {
        return mul(b, 2 * s);
      }
      return screen(b, 2 * s - 256);
    }
    case 12u: {
      if s < 128 {
        let l = low(s);
        if l == 0 {
          return 0;
        }
        return 255 - min(255, rd((255 - b) * 255, l));
      }
      let h = high(s);
      if h == 255 {
        return 255;
      }
      return min(255, rd(b * 255, 255 - h));
    }
    case 13u: {
      return clamp(b + 2 * s - 256, 0, 255);
    }
    case 14u: {
      if s < 128 {
        return min(b, low(s));
      }
      return max(b, high(s));
    }
    case 15u: {
      if s < 128 {
        return select(0, 255, b + s >= 255);
      }
      return select(0, 255, b + s > 255);
    }
    case 16u: {
      return abs(b - s);
    }
    case 17u: {
      return b + s - 2 * mul(b, s);
    }
    case 18u: {
      return max(0, b - s);
    }
    case 19u: {
      if s == 0 {
        return select(255, 0, b == 0);
      }
      return min(255, rd(b * 255, s));
    }
    default: {
      return s;
    }
  }
}
fn fill_blend(b: i32, s: i32, f: i32, mode: u32) -> i32 {
  if f == 0 {
    return b;
  }
  if f == 255 {
    return blend(b, s, mode);
  }
  switch mode {
    case 5u: {
      return burn(b, 255 - mul(255 - s, f));
    }
    case 6u: {
      return max(0, b - mul(255 - s, f));
    }
    case 7u: {
      return dodge(b, mul(s, f));
    }
    case 8u: {
      return min(255, b + mul(s, f));
    }
    case 12u: {
      if s < 128 {
        return burn(b, 255 - mul(255 - low(s), f));
      }
      return dodge(b, mul(high(s), f));
    }
    case 13u: {
      return clamp(b + rd(2 * s * f, 255) - f - 1, 0, 255);
    }
    case 15u: {
      let k = rd(254 * f, 255);
      return clamp(rd(255 * (b + mul(s, k) - k), 255 - k), 0, 255);
    }
    case 16u: {
      return abs(b - mul(s, f));
    }
    default: {
      return lerp(b, blend(b, s, mode), f);
    }
  }
}
fn paint(b: vec4i, s: vec3i, f: i32, mode: u32) -> vec4i {
  let total = b.a + f - mul(b.a, f);
  var rgb = vec3i(0);
  for (var c = 0u; c < 3u; c++) {
    if mode == 0u {
      rgb[c] = lerp(b[c], s[c], norm(f, total));
    }
    else {
      rgb[c] = lerp(fill_blend(b[c], s[c], f, mode), s[c], norm(total - b.a, total));
    }
  }
  return vec4i(rgb, total);
}
fn interpolate(b: vec4i, s: vec4i, w: i32) -> vec4i {
  let kept = mul(b.a, 255 - w);
  let added = mul(s.a, w);
  let share = norm(added, kept + added);
  return vec4i(mix_byte(b.r, s.r, share), mix_byte(b.g, s.g, share), mix_byte(b.b, s.b, share), kept + added);
}
fn unpack(word: u32) -> vec4i {
  return vec4i(i32(word & 255u), i32((word >> 8u) & 255u), i32((word >> 16u) & 255u), i32(word >> 24u));
}
fn pack(v: vec4i) -> u32 {
  return u32(v.r) | (u32(v.g) << 8u) | (u32(v.b) << 16u) | (u32(v.a) << 24u);
}
