import tgpu, { d, std } from 'typegpu';
import { viewLayout } from '../bindings';
import { project } from '../pageShader';

import { Cubic, CurveInstance, curveLayout, shapeOnlySlot } from './curveBindings';
import { clipOutlineCoverage, outlineCoverage, segmentSide, windingCoverage } from './curveCoverage';

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
  const shape = footprint(item);
  const local = std.sub(std.mul(quadCorner(input.vertex), std.add(d.vec2f(1), std.mul(shape.margin, 2))), shape.margin);

  return {
    position: projected(item, local),
    local,
    pagePosition: transformed(item, local),
    instance,
    localDx: shape.localDx,
    localDy: shape.localDy
  };
});

/**
 * Draws one magnified ordinary fill as a grid of cells: a non-indexed draw of six vertices per cell whose first instance
 * is the outline's and whose first vertex is the cells per side shifted left by {@link cellGridShift}. Each cell is
 * classified against the outline, widened by a pixel's footprint: off-screen cells and cells the boundary does not
 * reach are dropped when outside and marked `solid` when inside, so only cells along the boundary evaluate coverage and
 * a screen-filling figure costs little more than a flat fill. Outputs as {@link curveVertex}, plus `solid`.
 */
export const cellCurveVertex = tgpu.vertexFn({
  in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
  out: {
    position: d.builtin.position,
    local: d.vec2f,
    pagePosition: d.vec2f,
    instance: d.interpolate('flat', d.u32),
    localDx: d.interpolate('flat', d.vec2f),
    localDy: d.interpolate('flat', d.vec2f),
    solid: d.interpolate('flat', d.u32)
  }
})((input) => {
  'use gpu';
  const instance = input.instance;
  const item = curveLayout.$.instances[instance]!;
  const shape = footprint(item);
  const cells = d.f32(input.vertex >> cellGridShift);
  const vertex = input.vertex & d.u32(cellVertexMask);
  // Integer division would compile as float division in TypeGPU; these small integers divide exactly in f32.
  const cell = std.floor(d.f32(vertex) / 6);
  const span = std.add(d.vec2f(1), std.mul(shape.margin, 2));
  const index = d.vec2f(cell - std.floor(cell / cells) * cells, std.floor(cell / cells));
  const low = std.sub(std.mul(std.div(index, cells), span), shape.margin);
  const high = std.sub(std.mul(std.div(std.add(index, d.vec2f(1)), cells), span), shape.margin);
  const local = std.mix(low, high, quadCorner(vertex - d.u32(cell) * 6));
  let position = projected(item, local);
  let state = d.u32(0);

  if (onScreen(item, low, high)) {
    const pixel = std.mul(std.add(std.abs(shape.localDx), std.abs(shape.localDy)), 0.5);
    state = cellState(item, std.mul(std.add(low, high), 0.5), std.add(std.mul(std.sub(high, low), 0.5), pixel));
  }

  // Every vertex of an outside cell collapses to one point, leaving nothing to rasterize.
  if (state === 0) {
    position = d.vec4f(2, 2, 0, 1);
  }

  return {
    position,
    local,
    pagePosition: transformed(item, local),
    instance,
    localDx: shape.localDx,
    localDy: shape.localDy,
    solid: std.select(d.u32(0), d.u32(1), state === 1)
  };
});

/** Bit position of the cells per side in a {@link cellCurveVertex} draw's first vertex. */
export const cellGridShift = 16;
/** Bits of a {@link cellCurveVertex} vertex index below the cells per side. */
const cellVertexMask = (1 << cellGridShift) - 1;

/** An instance's quad margin and constant pixel derivatives, all in its local unit space. */
const Footprint = d.struct({ margin: d.vec2f, localDx: d.vec2f, localDy: d.vec2f });

/** The pixel derivatives of an instance's local space and the half-pixel margin its quad needs for anti-aliasing. */
function footprint(item: d.Infer<typeof CurveInstance>) {
  'use gpu';
  const scale = std.mul(viewLayout.$.view.mul, d.vec2f(1, -1));
  const r = viewLayout.$.view.rotation;
  const a = std.mul(item.matrix.xy, scale);
  const b = std.mul(item.matrix.zw, scale);
  const x = std.div(d.vec2f(r.x * a.x + r.z * a.y, r.y * a.x + r.w * a.y), viewLayout.$.view.rasterTexel);
  const y = std.div(d.vec2f(r.x * b.x + r.z * b.y, r.y * b.x + r.w * b.y), viewLayout.$.view.rasterTexel);
  const signed = x.x * y.y - x.y * y.x;
  const determinant = std.max(std.abs(signed), 1e-20);
  const inverse = std.select(-1, 1, signed >= 0) / determinant;

  return Footprint({
    margin: std.mul(
      d.vec2f((std.abs(y.x) + std.abs(y.y)) / determinant, (std.abs(x.x) + std.abs(x.y)) / determinant),
      0.501
    ),
    // Affine derivatives are constant. Interpolated dpdx/dpdy on tiny quads can introduce
    // cross-axis noise and incorrectly send axis-aligned text through rotated-pixel integration.
    localDx: std.mul(d.vec2f(y.y, -x.y), inverse),
    localDy: std.mul(d.vec2f(y.x, -x.x), inverse)
  });
}

/** The unit-square corner of vertex 0–5 of a two-triangle quad. */
function quadCorner(vertex: number) {
  'use gpu';
  return d.vec2f(
    std.select(0, 1, vertex === 1 || vertex === 4 || vertex === 5),
    std.select(0, 1, vertex >= 2 && vertex !== 4)
  );
}

/** Whether any part of the box from `low` to `high` in an instance's unit space projects inside clip space. */
function onScreen(item: d.Infer<typeof CurveInstance>, low: d.v2f, high: d.v2f) {
  'use gpu';
  const a = projected(item, low).xy;
  const b = projected(item, d.vec2f(high.x, low.y)).xy;
  const c = projected(item, d.vec2f(low.x, high.y)).xy;
  const e = projected(item, high).xy;
  const minimum = std.min(std.min(a, b), std.min(c, e));
  const maximum = std.max(std.max(a, b), std.max(c, e));
  return minimum.x <= 1 && minimum.y <= 1 && maximum.x >= -1 && maximum.y >= -1;
}

/**
 * Classifies the box at `center` with half-size `extent` in an outline's unit space: 2 when a segment may cross it,
 * otherwise 1 inside the fill and 0 outside.
 */
function cellState(item: d.Infer<typeof CurveInstance>, center: d.v2f, extent: d.v2f) {
  'use gpu';
  const binned = item.bins !== 0;
  const first = std.select(d.u32(0), d.u32(std.clamp(std.floor((center.y - extent.y) * 128), 0, 127)), binned);
  const last = std.select(d.u32(0), d.u32(std.clamp(std.floor((center.y + extent.y) * 128), 0, 127)), binned);
  const middle = std.select(d.u32(0), d.u32(std.clamp(std.floor(center.y * 128), 0, 127)), binned);
  let winding = d.i32(0);

  for (let row = first; row <= last; row++) {
    let start = d.u32(item.info.x);
    let count = d.u32(item.info.y);

    if (binned) {
      start = curveLayout.$.bins[item.bins + row * 2]!;
      count = curveLayout.$.bins[item.bins + row * 2 + 1]!;
    }

    for (let i = d.u32(0); i < count; i++) {
      let index = start + i;

      if (binned) {
        index = curveLayout.$.bins[index]!;
      }

      const curve = curveLayout.$.curves[index]!;
      const side = segmentSide(curve, center, extent);

      if (side < 0) {
        return d.u32(2);
      }

      const minimum = std.min(curve.p0.y, curve.p3.y);
      const maximum = std.max(curve.p0.y, curve.p3.y);

      if (row === middle && side === 1 && center.y >= minimum && center.y < maximum) {
        winding += std.select(d.i32(-1), d.i32(1), curve.p3.y > curve.p0.y);
      }
    }
  }

  return std.select(d.u32(0), d.u32(1), windingCoverage(winding, item.info.z) > 0);
}

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
    coverage = std.min(coverage, clipOutlineCoverage(clip, local, localDx, localDy));
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

    // Endpoints repeated as control points (PDF `l`, `v`, `y`) have zero speed, making them
    // stationary points that Newton cannot leave even when a nearby interior point is closer.
    best = std.clamp(best, 1 / 32, 31 / 32);

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
    const startDirection = endpointTangent(curve.p0, curve.p1, curve.p2, curve.p3);
    const endDirection = std.mul(endpointTangent(curve.p3, curve.p2, curve.p1, curve.p0), -1);

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

/**
 * Unit pixel-space tangent leaving `from`, using the first control point at least 0.01 px away.
 * PDF `l`/`v`/`y` curves repeat an endpoint as a control point; after f32 transforms the copy may differ
 * by rounding noise, whose direction is meaningless and would otherwise misplace butt/square caps.
 */
function endpointTangent(from: d.v2f, first: d.v2f, second: d.v2f, last: d.v2f) {
  'use gpu';
  let delta = std.sub(first, from);

  if (std.dot(delta, delta) <= 1e-4) {
    delta = std.sub(second, from);
  }

  if (std.dot(delta, delta) <= 1e-4) {
    delta = std.sub(last, from);
  }

  if (std.dot(delta, delta) <= 1e-4) {
    return d.vec2f(1, 0);
  }

  return std.normalize(delta);
}
