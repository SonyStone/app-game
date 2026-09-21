import tgpu, { d, std } from 'typegpu';
import { atlasLayout, viewLayout } from './bindings';
import { project } from './pageShader';

/** Interpolants preserve the original atlas coordinates and expanded glyph bounds. */
const glyphVaryings = {
  curves: d.vec2f,
  gridMin: d.vec2f,
  gridSize: d.vec2f,
  rasterMin: d.vec2f,
  rasterSize: d.vec2f,
  norm: d.vec2f,
  color: d.vec4f
};

/** Decodes packed glyph headers and applies the page/camera transform. */
export const glyphVertex = tgpu.vertexFn({
  in: { position: d.vec2f, curves: d.vec2u, color: d.vec4f, page: d.builtin.instanceIndex },
  out: { position: d.builtin.position, ...glyphVaryings }
})((input) => {
  'use gpu';
  const curves = std.floor(std.mul(d.vec2f(input.curves), 0.5));
  const corner = std.mod(d.vec2f(input.curves), d.vec2f(2));
  const gridMin = unpackPair(loadAtlas(curves));
  const rasterMin = unpackPair(loadAtlas(std.add(curves, d.vec2f(1, 0))));
  const sizes = std.mul(loadAtlas(std.add(curves, d.vec2f(2, 0))), 255);

  const rasterSize = sizes.zw;

  const longest = std.max(rasterSize.x, rasterSize.y);
  const expand = std.div(std.add(rasterSize, d.vec2f(longest * 0.4)), rasterSize);
  const norm = std.add(std.mul(std.sub(corner, d.vec2f(0.5)), expand), d.vec2f(0.5));

  return {
    position: project(d.vec2f(input.position.x + 0.5, 0.5 - input.position.y), input.page),
    curves,
    gridMin,
    gridSize: sizes.xy,
    rasterMin,
    rasterSize: d.vec2f(rasterSize),
    norm,
    color: d.vec4f(input.color)
  };
});

/** Ports the original four-direction coverage integral, including its small-text raster fallback. */
export const glyphFragment = tgpu.fragmentFn({
  in: { ...glyphVaryings, position: d.builtin.position },
  out: d.vec4f
})((input) => {
  'use gpu';
  // WebGPU's screen y points down. Negating dpdy retains the handedness of the GLSL coverage integral.
  const dx = std.dpdx(input.norm);
  const dy = std.mul(std.dpdy(input.norm), -1);

  const nc = std.mul(d.vec2f(input.norm.x, 1 - input.norm.y), input.rasterSize);
  const ndx = std.dpdx(nc);
  const ndy = std.dpdy(nc);
  const footprint = std.add(std.abs(ndx), std.abs(ndy));

  if (viewLayout.$.view.vectorOnly === 0 && std.min(footprint.x, footprint.y) > 2) {
    // The render target is top-down in WebGPU, so unlike GLSL this coordinate needs no y flip.
    const coord = std.mul(std.add(input.rasterMin, nc), viewLayout.$.view.rasterTexel);
    const ox = std.mul(std.mul(ndx, 0.33), viewLayout.$.view.rasterTexel);
    const oy = std.mul(std.mul(ndy, 0.33), viewLayout.$.view.rasterTexel);
    const lod = std.max(0, std.log2(std.max(std.length(ndx), std.length(ndy))) - 2);

    const coverage =
      sampleRaster(coord, lod) / 3 +
      (sampleRaster(std.sub(std.sub(coord, ox), oy), lod) +
        sampleRaster(std.add(std.sub(coord, ox), oy), lod) +
        sampleRaster(std.sub(std.add(coord, ox), oy), lod) +
        sampleRaster(std.add(std.add(coord, ox), oy), lod)) /
        6;

    return d.vec4f(input.color.rgb, input.color.a * coverage);
  }

  const cell = cellAt(input.norm, input.gridSize);
  const indicesCoord = std.add(input.gridMin, cell);
  const cellMid = std.div(std.add(cell, d.vec2f(0.5)), input.gridSize);
  const inv = inverse2(dx, dy);
  const indices1 = d.vec4i(std.add(std.mul(loadAtlas(indicesCoord), 255), d.vec4f(0.5)));
  const indices2 = d.vec4i(
    std.add(std.mul(loadAtlas(std.add(indicesCoord, d.vec2f(input.gridSize.x, 0))), 255), d.vec4f(0.5))
  );

  const more = indices1.x < indices1.y;
  let midClosest = std.select(d.f32(2), d.f32(-2), indices1.z < indices1.w);
  let closestEnd = d.f32(100);
  let closestControl = d.f32(100);
  const first = d.arrayOf(d.f32, 4)([2, 2, 2, 2]);
  let percent = d.f32(0);

  const line = std.sub(cellMid, input.norm);
  const v = std.div(line, std.max(std.dot(line, line), 1e-20));
  const midMatrix = d.mat2x2f(v.x, -v.y, v.y, v.x);
  const turn = d.mat2x2f(0.7071067811865476, 0.7071067811865476, -0.7071067811865476, 0.7071067811865476);

  for (const bezierIndex of std.range(8)) {
    let index = d.i32(0);
    if (bezierIndex < 4) {
      index = indices1[bezierIndex]!;
    } else {
      if (!more) {
        break;
      }
      index = indices2[bezierIndex - 4]!;
    }

    if (index < 2) {
      continue;
    }

    const origin = std.add(input.curves, d.vec2f(d.f32(index) + 1, 0));
    const a = std.sub(std.div(unpackPair(loadAtlas(origin)), 65535), input.norm);
    const b = std.sub(std.div(unpackPair(loadAtlas(std.add(origin, d.vec2f(1, 0)))), 65535), input.norm);
    const c = std.sub(std.div(unpackPair(loadAtlas(std.add(origin, d.vec2f(2, 0)))), 65535), input.norm);

    midClosest = closestCrossing(a, b, c, midMatrix, midClosest, cell, input.norm, input.gridSize);

    let p0 = std.mul(inv, a);
    let p1 = std.mul(inv, b);
    let p2 = std.mul(inv, c);

    if (viewLayout.$.view.debug !== 0) {
      closestEnd = std.min(closestEnd, std.min(std.dot(p0, p0), std.dot(p2, p2)));
      closestControl = std.min(closestControl, std.dot(p1, p1));
    }

    for (const ss of std.range(4)) {
      const roots = axisIntersections(p0.x, p1.x, p2.x);

      for (const ri of std.range(2)) {
        if (d.f32(ri) >= roots.z) {
          break;
        }

        const t = roots[ri]!;
        if (t > 0 && t <= 1) {
          const derivative = tangentAt(p0.x, p1.x, p2.x, t);
          const y = positionAt(p0.y, p1.y, p2.y, t);

          if (y > -1 && y < 1) {
            const delta = integrateWindow(y);
            percent += std.select(-delta, delta, derivative < 0);

            const distance = y + 1;
            if (distance < std.abs(first[ss]!)) {
              first[ss] = std.select(distance, -distance, derivative < 0);
            }
          }
        }
      }

      p0 = std.mul(turn, p0);
      p1 = std.mul(turn, p1);
      p2 = std.mul(turn, p2);
    }
  }

  for (const ss of std.range(4)) {
    if ((first[ss]! >= 2 && midClosest < 0) || (first[ss]! > 0 && std.abs(first[ss]!) < 2)) {
      percent += 1;
    }
  }

  const color = d.vec4f(input.color.rgb, (input.color.a * percent) / 4);

  if (viewLayout.$.view.debug !== 0) {
    const checker = std.mod(cell, d.vec2f(2));
    color.a += 0.5 * (checker.x - checker.y) * (checker.x - checker.y);
    if (more) {
      color.a *= 0.5 + 0.5 * std.mod(input.position.x, 2);
    }

    // Equivalent to GLSL's reversed-edge smoothstep, expressed with defined WGSL edge ordering.
    color.g += std.smoothstep(0, std.sqrt(closestEnd), 3);
    color.r += std.smoothstep(0, std.sqrt(closestControl), 3);
    color.a = std.max(color.a, std.max(color.g, color.r));
  }

  return color;
});

function loadAtlas(coord: d.v2f) {
  'use gpu';
  return std.textureLoad(atlasLayout.$.curves, d.vec2i(coord), 0);
}

function unpackPair(texel: d.v4f) {
  'use gpu';
  return d.vec2f(65280 * texel.r + 255 * texel.g, 65280 * texel.b + 255 * texel.a);
}

function sampleRaster(coord: d.v2f, level: number) {
  'use gpu';
  return std.textureSampleLevel(atlasLayout.$.raster, atlasLayout.$.sampler, coord, level).r;
}

function cellAt(point: d.v2f, size: d.v2f) {
  'use gpu';
  return std.floor(std.clamp(std.mul(point, size), d.vec2f(0.5), std.sub(size, d.vec2f(0.5))));
}

function inverse2(x: d.v2f, y: d.v2f) {
  'use gpu';
  const det = x.x * y.y - y.x * x.y;

  return d.mat2x2f(y.y / det, -x.y / det, -y.x / det, x.x / det);
}

/** Returns the two roots followed by their count; parallel constant curves have no crossings. */
function axisIntersections(p0: number, p1: number, p2: number) {
  'use gpu';
  if (std.abs(p0 - (2 * p1 - p2)) < 1e-5) {
    if (std.abs(p2 - p1) < 1e-20) {
      return d.vec3f(0);
    }

    return d.vec3f((0.5 * (p2 - 2 * p1)) / (p2 - p1), 0, 1);
  }

  const discriminant = p1 * p1 - p0 * p2;
  if (discriminant < 0) {
    return d.vec3f(0);
  }

  const root = std.sqrt(discriminant);
  const denom = p0 - 2 * p1 + p2;

  return d.vec3f((p0 - p1 + root) / denom, (p0 - p1 - root) / denom, 2);
}

function positionAt(p0: number, p1: number, p2: number, t: number) {
  'use gpu';
  const mt = 1 - t;

  return mt * mt * p0 + 2 * t * mt * p1 + t * t * p2;
}

function tangentAt(p0: number, p1: number, p2: number, t: number) {
  'use gpu';
  return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1);
}

function integrateWindow(x: number) {
  'use gpu';
  const squared = x * x;

  return std.sign(x) * (0.5 * squared * squared - squared) + 0.5;
}

function closestCrossing(
  a: d.v2f,
  b: d.v2f,
  c: d.v2f,
  matrix: d.m2x2f,
  closest: number,
  cell: d.v2f,
  norm: d.v2f,
  gridSize: d.v2f
) {
  'use gpu';
  const p0 = std.mul(matrix, a);
  const p1 = std.mul(matrix, b);
  const p2 = std.mul(matrix, c);

  const roots = axisIntersections(p0.y, p1.y, p2.y);
  let result = closest;

  for (const i of std.range(2)) {
    if (d.f32(i) >= roots.z) {
      break;
    }

    const t = roots[i]!;
    if (t > 0 && t < 1) {
      const x = positionAt(p0.x, p1.x, p2.x, t);
      const original = std.add(d.vec2f(positionAt(a.x, b.x, c.x, t), positionAt(a.y, b.y, c.y, t)), norm);
      const crossingCell = cellAt(original, gridSize);

      if (crossingCell.x === cell.x && crossingCell.y === cell.y && std.abs(x) < std.abs(result)) {
        result = std.select(x, -x, tangentAt(p0.y, p1.y, p2.y, t) < 0);
      }
    }
  }

  return result;
}
