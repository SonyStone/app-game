import tgpu, { d } from 'typegpu';

/** Compiles an opacity-independent geometry pass for knockout groups. */
export const shapeOnlySlot = tgpu.slot(false);

/** Disk CURV records: exact cubic control points, split at both axes' extrema. */
export const Cubic = d.struct({ p0: d.vec2f, p1: d.vec2f, p2: d.vec2f, p3: d.vec2f });

/** Disk DRAW records: local unit bounds → normalized page coordinates, then paint and clipping. */
export const CurveInstance = d.struct({
  matrix: d.vec4f,
  translation: d.vec2f,
  clipReference: d.u32,
  bins: d.u32,
  color: d.vec4f,
  clip: d.vec4f,
  info: d.vec4u
});

/** Read-only geometry is shared across every occurrence of an outline. */
export const curveLayout = tgpu.bindGroupLayout({
  curves: { storage: d.arrayOf(Cubic), access: 'readonly' },
  instances: { storage: d.arrayOf(CurveInstance), access: 'readonly' },
  clips: { storage: d.arrayOf(CurveInstance), access: 'readonly' },
  bins: { storage: d.arrayOf(d.u32), access: 'readonly' }
});
