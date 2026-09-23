import tgpu, { d, std } from 'typegpu';

/** Optional image-indexed radial geometry. Zero change.z selects ordinary texture coordinates. */
export const RadialGradient = d.struct({ bounds: d.vec4f, start: d.vec4f, change: d.vec4f, background: d.vec4f });

/** Radial geometry is separate from the color ramp so circle boundaries remain analytic at any zoom. */
export const radialLayout = tgpu.bindGroupLayout({ gradients: { storage: d.arrayOf(RadialGradient) } });

/** Returns color-ramp UV and coverage. Invalid intersections select the shading's background color. */
export function radialUv(uv: d.v2f, gradient: d.Infer<typeof RadialGradient>) {
  'use gpu';

  if (gradient.change.z === 0) {
    return d.vec3f(uv, 1);
  }

  const point = std.sub(std.mul(uv, gradient.bounds.xy), gradient.start.xy);
  const delta = gradient.change.xy;
  const radius = gradient.start.z;
  const radiusDelta = gradient.start.w;
  const a = std.dot(delta, delta) - radiusDelta * radiusDelta;
  const b = -2 * (std.dot(point, delta) + radius * radiusDelta);
  const c = std.dot(point, point) - radius * radius;
  let t = d.f32(-1e20);

  if (std.abs(a) <= 1e-6 * std.max(1e-12, std.dot(delta, delta) + radiusDelta * radiusDelta)) {
    if (std.abs(b) > 1e-10) {
      const root = -c / b;

      if (validRoot(root, gradient)) {
        t = root;
      }
    }
  } else {
    const discriminant = b * b - 4 * a * c;

    if (discriminant >= 0) {
      // The q form avoids subtracting nearly equal numbers near the focal circle.
      const q = -0.5 * (b + std.select(-std.sqrt(discriminant), std.sqrt(discriminant), b >= 0));
      const first = q / a;
      let second = d.f32(first);

      if (std.abs(q) > 1e-12) {
        second = c / q;
      }

      if (validRoot(first, gradient)) {
        t = first;
      }

      if (validRoot(second, gradient)) {
        t = std.max(t, second);
      }
    }
  }

  return d.vec3f((std.clamp(t, 0, 1) * 4095 + 0.5) / 4096, 0.5, std.select(0, 1, t > -1e19));
}

function validRoot(t: number, gradient: d.Infer<typeof RadialGradient>) {
  'use gpu';
  const flags = d.u32(gradient.change.z);
  return (
    gradient.start.z + t * gradient.start.w >= -1e-6 && (t >= 0 || (flags & 2) !== 0) && (t <= 1 || (flags & 4) !== 0)
  );
}
