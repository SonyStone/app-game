import tgpu, { d, std } from 'typegpu';
import { viewLayout } from '../bindings';
import { project } from '../pageShader';

import { Cubic, CurveInstance, curveLayout, shapeOnlySlot } from './curveBindings';
import { outlineCoverage } from './curveCoverage';

/** Expands bounds by the pixel's half footprint, including a small rounding margin. */
export const curveVertex = tgpu.vertexFn({
  in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
  out: {
    position: d.builtin.position,
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f)
  }
})((input) => {
  'use gpu';
  const instance = input.instance;
  const item = curveLayout.$.instances[instance]!;

  const scale = std.mul(viewLayout.$.view.mul, d.vec2f(1, -1));
  const r = viewLayout.$.view.rotation;
  const a = std.mul(item.matrix.xy, scale);
  const b = std.mul(item.matrix.zw, scale);
  const x = std.div(d.vec2f(r.x * a.x + r.z * a.y, r.y * a.x + r.w * a.y), viewLayout.$.view.rasterTexel);
  const y = std.div(d.vec2f(r.x * b.x + r.z * b.y, r.y * b.x + r.w * b.y), viewLayout.$.view.rasterTexel);
  const signed = x.x * y.y - x.y * y.x;
  const determinant = std.max(std.abs(signed), 1e-20);
  const inverse = std.select(-1, 1, signed >= 0) / determinant;
  const margin = std.mul(
    d.vec2f((std.abs(y.x) + std.abs(y.y)) / determinant, (std.abs(x.x) + std.abs(x.y)) / determinant),
    0.501
  );
  const corner = d.vec2f(
    std.select(0, 1, input.vertex === 1 || input.vertex === 4 || input.vertex === 5),
    std.select(0, 1, input.vertex >= 2 && input.vertex !== 4)
  );
  const local = std.sub(std.mul(corner, std.add(d.vec2f(1), std.mul(margin, 2))), margin);

  return {
    position: projected(item, local),
    local,
    pagePosition: transformed(item, local),
    instance,
    // Affine derivatives are constant. Interpolated dpdx/dpdy on tiny quads can introduce
    // cross-axis noise and incorrectly send axis-aligned text through rotated-pixel integration.
    localDx: std.mul(d.vec2f(y.y, -x.y), inverse),
    localDy: std.mul(d.vec2f(y.x, -x.x), inverse)
  };
});

/** Integrates original fill boundaries; zero-width strokes retain their one-pixel hairline treatment. */
export const curveFragment = tgpu.fragmentFn({
  in: {
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f)
  },
  out: d.vec4f
})((input) => {
  'use gpu';
  const dx = input.localDx;
  const dy = input.localDy;
  const item = curveLayout.$.instances[input.instance]!;
  let coverage = d.f32(0);

  if (item.info.z >= 3) {
    coverage = hairlineCoverage(item, input.local, dx, dy);
  } else {
    coverage = outlineCoverage(item, input.local, dx, dy);
  }
  coverage = std.min(
    coverage,
    clipCoverage(item.clipReference, input.pagePosition, std.dpdx(input.pagePosition), std.dpdy(input.pagePosition))
  );

  if (
    input.pagePosition.x < item.clip.x ||
    input.pagePosition.y < item.clip.y ||
    input.pagePosition.x > item.clip.z ||
    input.pagePosition.y > item.clip.w
  ) {
    coverage = 0;
  }

  if (shapeOnlySlot.$) {
    return d.vec4f(coverage);
  }

  const alpha = item.color.a * coverage;

  return d.vec4f(std.mul(item.color.rgb, alpha), alpha);
});

/** Evaluates the intersection of a bounded, persistent clip chain in normalized page space. */
export function clipCoverage(reference: number, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  let coverage = d.f32(1);
  let next = d.u32(reference);

  for (let depth = 0; depth < 32 && next !== 0; depth++) {
    const clip = curveLayout.$.clips[next - 1]!;
    const local = transformed(clip, point);
    const localDx = d.vec2f(clip.matrix.x * dx.x + clip.matrix.z * dx.y, clip.matrix.y * dx.x + clip.matrix.w * dx.y);
    const localDy = d.vec2f(clip.matrix.x * dy.x + clip.matrix.z * dy.y, clip.matrix.y * dy.x + clip.matrix.w * dy.y);
    coverage = std.min(coverage, outlineCoverage(clip, local, localDx, localDy));
    next = clip.info.w;
  }

  return coverage;
}

/** Applies the instance's local-to-page affine transform. */
export function transformed(item: d.Infer<typeof CurveInstance>, point: d.v2f) {
  'use gpu';
  return std.add(
    item.translation,
    d.vec2f(item.matrix.x * point.x + item.matrix.z * point.y, item.matrix.y * point.x + item.matrix.w * point.y)
  );
}

/** Projects a point through the document layout and current camera. */
export function projected(item: d.Infer<typeof CurveInstance>, point: d.v2f) {
  'use gpu';
  const p = transformed(item, point);

  return project(d.vec2f(p.x, 1 - p.y), item.info.w);
}

function at(curve: d.Infer<typeof Cubic>, t: number) {
  'use gpu';
  const a = std.mix(curve.p0, curve.p1, t);
  const b = std.mix(curve.p1, curve.p2, t);
  const c = std.mix(curve.p2, curve.p3, t);

  return std.mix(std.mix(a, b, t), std.mix(b, c, t), t);
}

// Work in framebuffer pixels so zero-width PDF strokes remain one pixel wide at every zoom.
function hairlineCoverage(item: d.Infer<typeof CurveInstance>, point: d.v2f, dx: d.v2f, dy: d.v2f) {
  'use gpu';
  const determinant = dx.x * dy.y - dx.y * dy.x;
  let distance = d.f32(1e10);

  for (let index = d.u32(0); index < item.info.y; index++) {
    const source = curveLayout.$.curves[item.info.x + index]!;
    const curve = Cubic({
      p0: pixelPosition(source.p0, point, dx, dy, determinant),
      p1: pixelPosition(source.p1, point, dx, dy, determinant),
      p2: pixelPosition(source.p2, point, dx, dy, determinant),
      p3: pixelPosition(source.p3, point, dx, dy, determinant)
    });
    let best = d.f32(0);
    let squared = d.f32(1e20);

    for (let sample = 0; sample <= 16; sample++) {
      const t = d.f32(sample) / 16;
      const p = at(curve, t);
      const candidate = std.dot(p, p);

      if (candidate < squared) {
        squared = candidate;
        best = t;
      }
    }

    for (let step = 0; step < 6; step++) {
      const p = at(curve, best);
      const tangent = std.mul(
        std.mix(
          std.mix(std.sub(curve.p1, curve.p0), std.sub(curve.p2, curve.p1), best),
          std.mix(std.sub(curve.p2, curve.p1), std.sub(curve.p3, curve.p2), best),
          best
        ),
        3
      );
      const second = std.mul(
        std.mix(
          std.add(std.sub(curve.p2, std.mul(curve.p1, 2)), curve.p0),
          std.add(std.sub(curve.p3, std.mul(curve.p2, 2)), curve.p1),
          best
        ),
        6
      );
      const denominator = std.dot(tangent, tangent) + std.dot(p, second);

      if (std.abs(denominator) > 1e-10) {
        best = std.clamp(best - std.dot(p, tangent) / denominator, 0, 1);
      }
    }

    let candidate = std.length(at(curve, best));
    const startDirection = std.normalize(std.sub(curve.p1, curve.p0));
    const endDirection = std.normalize(std.sub(curve.p3, curve.p2));

    if (item.info.z === 3) {
      candidate = std.max(
        candidate,
        std.max(0.5 + std.dot(curve.p0, startDirection), 0.5 - std.dot(curve.p3, endDirection))
      );
    }

    if (item.info.z === 5) {
      const start = std.sub(curve.p0, std.mul(startDirection, 0.5));
      const end = std.add(curve.p3, std.mul(endDirection, 0.5));
      const a = std.add(start, std.mul(startDirection, std.clamp(-std.dot(start, startDirection), 0, 0.5)));
      const b = std.sub(end, std.mul(endDirection, std.clamp(std.dot(end, endDirection), 0, 0.5)));
      candidate = std.min(candidate, std.min(std.length(a), std.length(b)));
    }

    distance = std.min(distance, candidate);
  }

  return std.clamp(1 - distance, 0, 1);
}

function pixelPosition(p: d.v2f, origin: d.v2f, dx: d.v2f, dy: d.v2f, determinant: number) {
  'use gpu';
  const delta = std.sub(p, origin);
  return d.vec2f((delta.x * dy.y - delta.y * dy.x) / determinant, (dx.x * delta.y - dx.y * delta.x) / determinant);
}
