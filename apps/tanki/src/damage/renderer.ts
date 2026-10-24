import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';
import { CHANNELS, type DamageField } from './field';

/**
 * WebGPU renderer of the damage range, written with TypeGPU.
 *
 * Three kinds of things are drawn, all as instanced quads:
 *
 * - Bodies: each quad shades one shape. Destructible shapes read their distance field from a
 *   shared storage buffer, where every field owns a fixed slot; turrets and the floor are drawn
 *   from formulas. Fill, outline, painted lines, soot and the core all come from distances, so
 *   edges stay sharp at any zoom.
 * - Particles: sparks, puffs, dust and trail points live in a ring buffer that a compute shader
 *   advances every frame. The CPU only writes newly spawned particles.
 * - Smoke plumes: balls that the CPU places anew every frame, already seen from the camera, so
 *   the renderer knows nothing of their motion. Each ball is shaded as a sphere lit by the sun
 *   and laid over the plume texture in the order given; balls heaped on balls read as cauliflower
 *   billows. The same balls, cast along the sun, sum their density into a smoke shadow map.
 *
 * Shadows come from a screen-sized height map that bodies are also drawn into. The sun casts
 * a hard drop shadow from everything in one fixed direction, as on a map with building shadows,
 * and smoke overhead shades the ground as deeply, without stacking with the shadows of bodies.
 * Point lights, such as flashes and fires, hang at their own height: each light's quad walks the
 * height map from every pixel toward the light, and whatever rises above the line between them
 * shades the pixel, so turrets shade their hulls and shadows grow longer the lower the light.
 * Lights are gathered into two screen buffers first: how much ambient light any of them claims
 * (the strongest claim wins) and how much light reaches each pixel (summed over lights). Applying
 * them multiplies the scene, so black outlines stay black; shadows of several lights do not stack,
 * and one light's shadow is filled by another light. Lights also add a glow to the air. Fire is
 * drawn under the smoke but keeps its own brightness through the light passes; plumes hang high
 * above the lights and keep their own shading too; sparks are drawn after all shading.
 *
 * Bodies keep the look of a vector illustration with hard outlines. Puffs of soot and fire are
 * not drawn one by one: each is written as a distance into a screen-sized texture with `max`
 * blending, which merges overlapping puffs into one shape per layer, and a full-screen pass then
 * fills each layer and outlines its merged contour. Shot trails go into the same texture as
 * coverage, so the joints of a trail's segments never darken where they overlap. Plumes are soft
 * by default, after satellite photos of fires; `PLUME_INKED` outlines their dense billows instead.
 */
export function createRangeRenderer(gpu: GpuContext) {
  const { root, device, format } = gpu;

  const camera = root.createUniform(Camera);
  const simulation = root.createUniform(Simulation);
  const bodies = root.createReadonly(d.arrayOf(BodyInstance, MAX_BODIES));
  const fields = root.createReadonly(d.arrayOf(d.vec4f, FIELD_SLOTS * SLOT_CELLS));
  const particles = root.createMutable(d.arrayOf(Particle, MAX_PARTICLES));
  // Vertex shaders may not bind writable storage, so drawing reads the same buffer through a read-only view.
  const particlesView = root.createReadonly(d.arrayOf(Particle, MAX_PARTICLES), root.unwrap(particles.buffer));
  const lights = root.createReadonly(d.arrayOf(Light, MAX_LIGHTS));
  const plumeBalls = root.createReadonly(d.arrayOf(PlumeBall, MAX_PLUME_BALLS));

  /** Signed coverage of a distance at the current zoom: 1 inside, 0 outside, smooth over a screen pixel. */
  const coverage = (distance: number) => {
    'use gpu';
    const aa = 0.75 / camera.$.zoom;
    return std.smoothstep(aa, -aa, distance);
  };

  /** 1 on a band of `width` pixels just inside a shape's edge, for outlines. */
  const edgeBand = (distance: number, width: number) => {
    'use gpu';
    const aa = 0.75 / camera.$.zoom;
    return std.smoothstep(-width - aa, -width + aa, distance);
  };

  /** Places `color` with `alpha` coverage over premultiplied `below`. */
  const over = (below: d.v4f, color: d.v3f, alpha: number) => {
    'use gpu';
    return std.add(std.mul(below, 1 - alpha), d.vec4f(std.mul(color, alpha), alpha));
  };

  const rotate = (point: d.v2f, cosSin: d.v2f) => {
    'use gpu';
    return d.vec2f(point.x * cosSin.x - point.y * cosSin.y, point.x * cosSin.y + point.y * cosSin.x);
  };

  const project = (world: d.v2f) => {
    'use gpu';
    const view = std.mul(rotate(std.sub(world, camera.$.center), camera.$.rotation), camera.$.zoom);
    return d.vec4f(view.x / (camera.$.viewport.x / 2), -view.y / (camera.$.viewport.y / 2), 0, 1);
  };

  /** Quad corner (0 or 1 per axis) of vertex 0-5 of two triangles. */
  const quadCorner = (vertex: number) => {
    'use gpu';
    return d.vec2f(
      std.select(0, 1, vertex === 1 || vertex === 4 || vertex === 5),
      std.select(0, 1, vertex >= 2 && vertex !== 4)
    );
  };

  const roundedBox = (point: d.v2f, half: d.v2f, radius: number) => {
    'use gpu';
    const q = std.add(std.sub(std.abs(point), half), radius);
    return std.length(std.max(q, d.vec2f(0))) + std.min(std.max(q.x, q.y), 0) - radius;
  };

  const texel = (base: number, cols: number, col: number, row: number) => {
    'use gpu';
    return d.vec4f(fields.$[base + d.u32(row) * cols + d.u32(col)]!);
  };

  /** Bilinear sample of a body's field at a local point, clamped to its grid. */
  const sampleField = (item: d.Infer<typeof BodyInstance>, point: d.v2f) => {
    'use gpu';
    const cols = d.u32(item.grid.x);
    const rows = d.u32(item.grid.y);
    const base = d.u32(item.grid.z) * SLOT_CELLS;
    const position = std.div(std.sub(point, item.field.xy), item.field.z);
    const floor = std.floor(position);
    const t = std.clamp(std.sub(position, floor), d.vec2f(0), d.vec2f(1));
    const x0 = std.clamp(d.i32(floor.x), 0, d.i32(cols) - 1);
    const y0 = std.clamp(d.i32(floor.y), 0, d.i32(rows) - 1);
    const x1 = std.min(x0 + 1, d.i32(cols) - 1);
    const y1 = std.min(y0 + 1, d.i32(rows) - 1);
    const top = std.mix(texel(base, cols, x0, y0), texel(base, cols, x1, y0), t.x);
    const bottom = std.mix(texel(base, cols, x0, y1), texel(base, cols, x1, y1), t.x);
    return std.mix(top, bottom, t.y);
  };

  const bodyVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { position: d.builtin.position, local: d.vec2f, instance: d.interpolate('flat', d.u32) }
  })((input) => {
    'use gpu';
    const item = bodies.$[input.instance]!;
    const size = std.mul(item.grid.xy, item.field.z);
    const local = std.add(std.sub(item.field.xy, item.field.z / 2), std.mul(quadCorner(input.vertex), size));
    const world = std.add(item.placement.xy, rotate(local, item.placement.zw));
    return { position: project(world), local, instance: input.instance };
  });

  const bodyFragment = tgpu.fragmentFn({
    in: { local: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const item = bodies.$[input.instance]!;
    const kind = d.u32(item.grid.w);
    const black = d.vec3f(0.02);
    const flash = item.color.w;
    let result = d.vec4f(0);

    if (kind === KIND_FIELD || kind === KIND_FIELD_OPEN) {
      const sample = sampleField(item, input.local);
      const open = kind === KIND_FIELD_OPEN;
      // The armor covers the core until a hole opens onto it; then the core shows through its own pocket.
      const armorDistance = std.select(sample.x, std.max(sample.x, -sample.z), open);
      const fill = std.mix(item.color.xyz, d.vec3f(0.12, 0.11, 0.1), sample.w * 0.85);
      const lines = std.max(edgeBand(armorDistance, d.f32(OUTLINE)), coverage(sample.y));
      const armor = std.mix(std.mix(fill, black, lines), d.vec3f(1), flash * 0.6);

      if (open) {
        const core = std.mix(CORE_COLOR, d.vec3f(0.35, 0.05, 0), edgeBand(sample.z, 0.8));
        result = over(result, core, coverage(sample.z));
      }

      result = over(result, armor, coverage(armorDistance));
    } else if (kind === KIND_TURRET) {
      const barrel = roundedBox(std.sub(input.local, d.vec2f(18.55, 0)), d.vec2f(11.25, 3.75), d.f32(1));
      const cupola = std.length(input.local) - 9.6;
      const fill = std.mix(item.color.xyz, d.vec3f(1), flash * 0.6);
      result = over(result, std.mix(fill, black, edgeBand(barrel, d.f32(OUTLINE))), coverage(barrel));
      result = over(result, std.mix(fill, black, edgeBand(cupola, d.f32(OUTLINE))), coverage(cupola));
    } else {
      const half = std.mul(item.grid.xy, item.field.z / 2);
      const center = std.add(std.sub(item.field.xy, item.field.z / 2), half);
      result = over(result, item.color.xyz, coverage(roundedBox(std.sub(input.local, center), half, d.f32(0))));
    }

    return std.mul(result, item.field.w);
  });

  const particleVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: {
      position: d.builtin.position,
      uv: d.vec2f,
      color: d.vec4f,
      fade: d.f32,
      kind: d.interpolate('flat', d.u32)
    }
  })((input) => {
    'use gpu';
    const particle = particlesView.$[input.instance]!;
    const age = particle.life.x;
    const life = particle.life.y;
    const kind = d.u32(particle.life.w);
    const uv = std.sub(std.mul(quadCorner(input.vertex), 2), 1);
    const fade = 1 - age / std.max(life, 0.0001);
    let offset = std.mul(uv, particle.life.z);

    if (kind === PARTICLE_SPARK) {
      const speed = std.length(particle.motion.zw);
      const along = std.select(d.vec2f(1, 0), std.div(particle.motion.zw, speed), speed > 0.001);
      const across = d.vec2f(-along.y, along.x);
      offset = std.add(std.mul(along, uv.x * (particle.life.z + speed * 0.03)), std.mul(across, uv.y * 0.9));
    }

    let position = project(std.add(particle.motion.xy, offset));

    if (age >= life || isPuff(kind) || kind === PARTICLE_TRAIL) {
      position = d.vec4f(2, 2, 0, 1);
    }

    return { position, uv, color: particle.color, fade, kind };
  });

  const particleFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, color: d.vec4f, fade: d.f32, kind: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    // Derivatives must be taken before any branch on the particle kind.
    const radius = std.length(input.uv);
    const aa = std.fwidth(radius);
    const edge = std.fwidth(input.uv.y);
    const alpha = input.color.w * std.saturate(input.fade * 4);

    if (input.kind === PARTICLE_SPARK) {
      // A tapered streak, wide at the head: +x points along the velocity.
      const half = std.mix(0.25, 1, (input.uv.x + 1) / 2);
      const across = std.abs(input.uv.y);
      const cover = std.smoothstep(half + edge, half - edge, across) * std.smoothstep(1, 0.9, std.abs(input.uv.x));
      return d.vec4f(std.mul(input.color.xyz, cover * alpha), cover * alpha);
    }

    // Dust: a hard chip, too small for an outline.
    const cover = std.smoothstep(1 + aa, 1 - aa, radius) * alpha;
    return d.vec4f(std.mul(input.color.xyz, cover), cover);
  });

  const isPuff = (kind: number) => {
    'use gpu';
    return kind === PARTICLE_SMOKE || kind === PARTICLE_SOOT || kind === PARTICLE_FIRE;
  };

  /** Current radius of a puff: smoke and soot billow, then shrink away; fire flares and dies fast. */
  const puffRadius = (kind: number, size: number, t: number) => {
    'use gpu';
    let radius = size * (0.6 + 1.2 * t) * std.pow(1 - t, 0.5);

    if (kind === PARTICLE_FIRE) {
      radius = size * (0.8 + 0.6 * t) * std.pow(1 - t, 0.7);
    }

    return radius;
  };

  const puffVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { position: d.builtin.position, offset: d.vec2f, radius: d.f32, kind: d.interpolate('flat', d.u32) }
  })((input) => {
    'use gpu';
    const particle = particlesView.$[input.instance]!;
    const kind = d.u32(particle.life.w);
    const t = std.saturate(particle.life.x / std.max(particle.life.y, 0.0001));
    const radius = puffRadius(kind, particle.life.z, t);
    // Two extra pixels keep the outline and its antialiasing inside the quad.
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), radius + 2);
    let position = project(std.add(particle.motion.xy, offset));

    if (particle.life.x >= particle.life.y || !isPuff(kind)) {
      position = d.vec4f(2, 2, 0, 1);
    }

    return { position, offset, radius, kind };
  });

  /** Writes how far inside the puff this pixel is into the puff's layer; other layers get "far outside". */
  const puffFragment = tgpu.fragmentFn({
    in: { offset: d.vec2f, radius: d.f32, kind: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const inside = input.radius - std.length(input.offset);
    return d.vec4f(
      FAR_OUTSIDE,
      std.select(FAR_OUTSIDE, inside, input.kind === PARTICLE_SOOT),
      std.select(FAR_OUTSIDE, inside, input.kind === PARTICLE_FIRE),
      std.select(FAR_OUTSIDE, inside, input.kind === PARTICLE_SMOKE)
    );
  });

  /**
   * One segment of a shot trail, from trail point `instance` to the next point in the ring when
   * both belong to the same trail. The quad covers the segment plus its half width around it.
   */
  const trailVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: {
      position: d.builtin.position,
      local: d.vec2f,
      length: d.f32,
      along: d.vec2f,
      fade: d.f32
    }
  })((input) => {
    'use gpu';
    const start = particlesView.$[input.instance]!;
    const end = particlesView.$[(input.instance + 1) % MAX_PARTICLES]!;
    const halfWidth = start.life.z / 2;
    const step = std.sub(end.motion.xy, start.motion.xy);
    const length = std.length(step);
    const direction = std.select(d.vec2f(1, 0), std.div(step, length), length > 0.0001);
    const normal = d.vec2f(-direction.y, direction.x);
    const corner = quadCorner(input.vertex);
    const local = d.vec2f(std.mix(-halfWidth - 1, length + halfWidth + 1, corner.x), std.mix(-halfWidth - 1, halfWidth + 1, corner.y));
    const world = std.add(start.motion.xy, std.add(std.mul(direction, local.x), std.mul(normal, local.y)));
    let position = project(world);
    const linked =
      d.u32(start.life.w) === PARTICLE_TRAIL &&
      d.u32(end.life.w) === PARTICLE_TRAIL &&
      start.color.y === end.color.y &&
      start.life.x < start.life.y;

    if (!linked) {
      position = d.vec4f(2, 2, 0, 1);
    }

    return {
      position,
      local,
      length,
      along: d.vec2f(start.color.x, end.color.x),
      fade: 1 - start.life.x / std.max(start.life.y, 0.0001)
    };
  });

  /** Writes the trail's opacity here, after Godot's `Line2D`: 5 px wide, from faint at the muzzle to solid at the end. */
  const trailFragment = tgpu.fragmentFn({
    in: { local: d.vec2f, length: d.f32, along: d.vec2f, fade: d.f32 },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const nearest = std.clamp(input.local.x, 0, input.length);
    const distance = std.length(d.vec2f(input.local.x - nearest, input.local.y));
    const t = std.mix(input.along.x, input.along.y, nearest / std.max(input.length, 0.0001));
    const opacity = coverage(distance - TRAIL_WIDTH / 2) * std.mix(0.31, 1, t) * input.fade;
    return d.vec4f(opacity, FAR_OUTSIDE, FAR_OUTSIDE, FAR_OUTSIDE);
  });

  /** Quad around a plume ball as seen from the camera; `offset` is in world pixels from its center. */
  const plumeVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { position: d.builtin.position, offset: d.vec2f, instance: d.interpolate('flat', d.u32) }
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), ball.seen.z * (1 + PLUME_LUMPS) + 1);
    return { position: project(std.add(ball.seen.xy, offset)), offset, instance: input.instance };
  });

  /** Quad around the shadow a plume ball casts on the ground. */
  const plumeShadowVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { position: d.builtin.position, offset: d.vec2f, instance: d.interpolate('flat', d.u32) }
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), ball.shadow.z * (1 + PLUME_LUMPS) + 1);
    return { position: project(std.add(ball.shadow.xy, offset)), offset, instance: input.instance };
  });

  /**
   * A plume ball at `offset` from its center: how far up its dome the point is (1 on top, 0 at
   * the rim), its density there, which stays full in the middle and falls off over the outer
   * `softness` of the radius, and its radius in this direction. The rim is lumpy rather than
   * round, turned by the ball's `turn` (`look.w`). A soft edge is ragged too, with noise that
   * turns with the ball, so thinning smoke frays instead of blurring; `grain` picks the noise.
   */
  const ballAt = (offset: d.v2f, radius: number, look: d.v4f, softness: number, grain: number) => {
    'use gpu';
    const angle = std.atan2(offset.y, offset.x);
    const lumps =
      std.sin(angle * 3 + look.w) * 0.5 +
      std.sin(angle * 5 - look.w * 1.7) * 0.3 +
      std.sin(angle * 9 + look.w * 2.3) * 0.2;
    const reach = radius * (1 + PLUME_LUMPS * lumps);
    const r = std.length(offset) / reach;
    const dome = std.sqrt(std.max(1 - r * r, 0));
    const turned = rotate(std.div(offset, radius), d.vec2f(std.cos(look.w), std.sin(look.w)));
    const local = std.add(std.mul(turned, PLUME_FRAY_SCALE), grain * 37);
    // Fraying only eats into the edge, so the ball never spills out of its quad.
    const fray = valueNoise(local) * softness * PLUME_FRAY;
    const density = std.smoothstep(1, 1 - softness, r + fray) * look.x;
    return d.vec3f(dome, density, reach);
  };

  /**
   * Lays a ball over the plume, premultiplied: its shade (0 dark to 1 sunlit), heat and ink, and
   * its density as opacity. Shading is the ball's own, as a sphere: sunlit on the side facing the
   * sun, darker toward its rim, where neighbours crowd it, so billows heaped on billows read as
   * cauliflower. Inked plumes (`PLUME_INKED`) shade dense balls in flat bands and outline them;
   * the balls above cover the outlines below, so only the arcs of the cloud's billows show. As a
   * ball thins out, its outline fades and its edge and shading go soft, so thin smoke never shows
   * outlines through each other.
   */
  const plumeFragment = tgpu.fragmentFn({
    in: { offset: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    // Derivatives must be taken before any branch.
    const aa = std.fwidth(std.length(input.offset) / ball.seen.z);
    const inking = std.select(0, std.smoothstep(PLUME_INKED_FROM, 1, ball.look.x), PLUME_INKED);
    const shape = ballAt(input.offset, ball.seen.z, ball.look, std.mix(ball.look.y, aa * 1.5, inking), ball.seen.w);
    const r = std.length(input.offset) / shape.z;
    const normal = d.vec3f(std.div(input.offset, shape.z), shape.x);
    const sunlit = std.saturate((std.dot(normal, SUN_TOWARD) - PLUME_TERMINATOR) / (1 - PLUME_TERMINATOR));
    let shade = (sunlit * PLUME_SUNLIGHT + 1 - PLUME_SUNLIGHT) * std.mix(PLUME_RIM, 1, std.sqrt(shape.x)) * ball.seen.w;
    const band = std.fwidth(shade);
    let ink = d.f32(0);

    if (PLUME_INKED) {
      const bands =
        0.15 +
        0.4 * std.smoothstep(0.3 - band, 0.3 + band, shade) +
        0.45 * std.smoothstep(0.62 - band, 0.62 + band, shade);
      const line = PLUME_INK_WIDTH / shape.z;
      shade = std.mix(shade, bands, inking);
      ink = std.smoothstep(1 - line - aa, 1 - line + aa, r) * inking;
    }

    const alpha = shape.y;

    // Corners of the quad outside the ball would only blend in nothing.
    if (alpha <= 0) {
      std.discard();
    }

    return d.vec4f(shade * alpha, ball.look.z * alpha, ink * alpha, alpha);
  });

  /** Adds a ball's shadow to the density of smoke over the ground; shadows are softer than the balls. */
  const plumeShadowFragment = tgpu.fragmentFn({
    in: { offset: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    const softness = std.max(ball.look.y, PLUME_SHADOW_SOFTNESS);
    const shape = ballAt(input.offset, ball.shadow.z, ball.look, softness, ball.seen.w);

    if (shape.y <= 0) {
      std.discard();
    }

    return d.vec4f(shape.y, 0, 0, 0);
  });

  const screenVertex = tgpu.vertexFn({ in: { index: d.builtin.vertexIndex }, out: { position: d.builtin.position } })(
    (input) => {
      'use gpu';
      const corner = d.vec2f(d.f32((input.index << 1) & 2), d.f32(input.index & 2));
      return { position: d.vec4f(corner.x * 2 - 1, corner.y * 2 - 1, 0, 1) };
    }
  );

  /** One puff layer: a fill with an outline of `outline` pixels around the merged contour. */
  const puffLayer = (below: d.v4f, inside: number, fill: d.v3f, line: d.v3f, outline: number, opacity: number) => {
    'use gpu';
    const cover = coverage(-inside);
    const color = std.mix(fill, line, edgeBand(-inside, outline));
    return over(below, color, cover * opacity);
  };

  /** World position of the center of a canvas pixel, for a canvas `size` pixels large. */
  const pixelToWorld = (pixel: d.v2f, size: d.v2f) => {
    'use gpu';
    const clip = d.vec2f((pixel.x / size.x) * 2 - 1, 1 - (pixel.y / size.y) * 2);
    const view = d.vec2f((clip.x * camera.$.viewport.x) / 2, (-clip.y * camera.$.viewport.y) / 2);
    const rotation = camera.$.rotation;
    return std.add(camera.$.center, rotate(std.div(view, camera.$.zoom), d.vec2f(rotation.x, -rotation.y)));
  };

  const hash = (cell: d.v2f) => {
    'use gpu';
    return std.fract(std.sin(std.dot(cell, d.vec2f(127.1, 311.7))) * 43758.5453);
  };

  /** Smooth value noise, 0 to 1, varying over about one unit. */
  const valueNoise = (point: d.v2f) => {
    'use gpu';
    const cell = std.floor(point);
    const f = std.fract(point);
    const u = std.mul(std.mul(f, f), std.sub(d.vec2f(3), std.mul(f, 2)));
    const bottom = std.mix(hash(cell), hash(std.add(cell, d.vec2f(1, 0))), u.x);
    const top = std.mix(hash(std.add(cell, d.vec2f(0, 1))), hash(std.add(cell, d.vec2f(1, 1))), u.x);
    return std.mix(bottom, top, u.y);
  };

  /**
   * Lumps added to soot, in world pixels, that slowly boil: small ones roughen the outline, large
   * ones only bend the shading, which breaks thick smoke into cauliflower billows.
   */
  const sootLumps = (pixel: d.v2f, size: d.v2f) => {
    'use gpu';
    const world = std.sub(pixelToWorld(pixel, size), std.mul(SOOT_BOIL, simulation.$.time));
    const small = (valueNoise(std.mul(world, 0.35)) - 0.5) * SOOT_LUMP_SMALL;
    const large = (valueNoise(std.mul(world, 0.12)) - 0.5) * SOOT_LUMP_LARGE;
    return d.vec2f(small, small + large);
  };

  /** Opacity of the plume at a pixel. */
  const plumeOpacity = (pixel: d.v2i) => {
    'use gpu';
    return std.textureLoad(puffLayout.$.plume, pixel, 0).w;
  };

  /**
   * How much of a pixel keeps its own light, which point lights leave alone: fire that soot and
   * plumes do not cover still glows, and a plume hangs high above the lights near the ground.
   */
  const keepsOwnLight = (pixel: d.v2i) => {
    'use gpu';
    const layers = std.textureLoad(puffLayout.$.puffs, pixel, 0);
    const plume = plumeOpacity(pixel);
    return coverage(-layers.z) * (1 - coverage(-layers.y)) * (1 - plume) + plume;
  };

  /**
   * Trails, gun smoke, fire, soot and smoke plumes, in that order, all before point lights. Soot is
   * lumpy and shaded in two tones, lighter where a lump faces the sun. Fire lies under the soot and
   * the plumes and peeks out of them; light passes leave it alone, so it still glows. Plumes go on
   * top, since they hang in the air: charcoal, with paler sunlit billows, and warm low down where
   * the flames light them.
   */
  const smokeComposite = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const pixel = d.vec2i(std.floor(input.position.xy));
    const size = d.vec2i(std.textureDimensions(puffLayout.$.puffs));
    const sizeF = d.vec2f(size);
    const last = std.sub(size, 1);
    const layers = std.textureLoad(puffLayout.$.puffs, pixel, 0);
    const towardSun = rotate(std.neg(SUN_DIRECTION), camera.$.rotation);

    let result = over(d.vec4f(0), TRAIL_COLOR, std.saturate(layers.x));
    result = puffLayer(result, layers.w, d.vec3f(0.84), d.vec3f(0.5), 0.6, 0.9);

    const fire = std.mix(FIRE_EDGE, FIRE_CORE, std.smoothstep(1, 3.5, layers.z));
    result = puffLayer(result, layers.z, fire, FIRE_OUTLINE, 0.7, d.f32(1));

    if (layers.y > -SOOT_LUMP_SMALL) {
      const here = std.add(d.vec2f(pixel), 0.5);
      const lumps = sootLumps(here, sizeF);
      const right = std.textureLoad(puffLayout.$.puffs, std.min(std.add(pixel, d.vec2i(1, 0)), last), 0).y;
      const left = std.textureLoad(puffLayout.$.puffs, std.max(std.sub(pixel, d.vec2i(1, 0)), d.vec2i(0)), 0).y;
      const down = std.textureLoad(puffLayout.$.puffs, std.min(std.add(pixel, d.vec2i(0, 1)), last), 0).y;
      const up = std.textureLoad(puffLayout.$.puffs, std.max(std.sub(pixel, d.vec2i(0, 1)), d.vec2i(0)), 0).y;
      const inward = d.vec2f(
        right + sootLumps(std.add(here, d.vec2f(1, 0)), sizeF).y - left - sootLumps(std.sub(here, d.vec2f(1, 0)), sizeF).y,
        down + sootLumps(std.add(here, d.vec2f(0, 1)), sizeF).y - up - sootLumps(std.sub(here, d.vec2f(0, 1)), sizeF).y
      );
      const steepness = std.length(inward);
      const facing = std.select(0, -std.dot(inward, towardSun) / steepness, steepness > 0.0001);
      const soot = std.mix(SOOT_SHADE, SOOT_LIGHT, std.smoothstep(0.1, 0.3, facing));
      result = puffLayer(result, layers.y + lumps.x, soot, d.vec3f(0.03), 0.7, d.f32(1));
    }

    const plume = std.textureLoad(puffLayout.$.plume, pixel, 0);

    if (plume.w > PLUME_MIN_OPACITY) {
      const shade = std.saturate(plume.x / plume.w);
      const heat = std.saturate(plume.y / plume.w);
      const ink = std.saturate(plume.z / plume.w);
      const smoke = std.add(std.mix(PLUME_SHADE, PLUME_LIGHT, shade), std.mul(PLUME_HEAT, heat));
      const color = std.mix(smoke, PLUME_INK, ink);
      result = over(result, color, plume.w);
    }

    return result;
  });

  /**
   * Sunlight: darkens this pixel when something in the height map stands between it and the sun,
   * or as far as smoke overhead blocks the sun. Walks the map toward the sun, along
   * `SUN_DIRECTION` reversed, for as far as the tallest body can throw a shadow; the line to the
   * sun rises `1 / SUN_SHADOW_LENGTH` pixels per pixel. Shadows of bodies and of smoke do not stack.
   */
  const sunShadowFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const size = d.vec2f(std.textureDimensions(occluderLayout.$.occluders));
    const pixelsPerWorld = camera.$.zoom * (size.x / camera.$.viewport.x);
    const towardSun = std.mul(rotate(std.neg(SUN_DIRECTION), camera.$.rotation), pixelsPerWorld);
    const pixel = input.position.xy;
    const height = std.textureLoad(occluderLayout.$.occluders, d.vec2i(std.floor(pixel)), 0).x;
    const reach = (MAX_HEIGHT - height) * SUN_SHADOW_LENGTH;
    const steps = std.clamp(d.i32((reach * pixelsPerWorld) / 1.5), 1, MAX_SUN_STEPS);
    const smokeDensity = std.textureLoad(puffLayout.$.smokeShadows, d.vec2i(std.floor(pixel)), 0).x;
    const smoke = 1 - std.exp(-smokeDensity * SMOKE_SHADOW_DENSITY);
    let shade = std.mix(1, SUN_SHADE, smoke);

    for (let step = d.i32(1); step <= steps; step++) {
      const distance = (reach * d.f32(step)) / d.f32(steps);
      const point = std.add(pixel, std.mul(towardSun, distance));
      const inside = std.clamp(d.vec2i(std.floor(point)), d.vec2i(0), std.sub(d.vec2i(size), 1));

      if (std.textureLoad(occluderLayout.$.occluders, inside, 0).x > height + distance / SUN_SHADOW_LENGTH + SHADOW_BIAS) {
        shade = SUN_SHADE;
        break;
      }
    }

    return d.vec4f(d.vec3f(shade), 1);
  });

  /** Height of whatever covers this pixel, for the height map; the floor is at 0. */
  const occluderFragment = tgpu.fragmentFn({
    in: { local: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const item = bodies.$[input.instance]!;
    const kind = d.u32(item.grid.w);
    let cover = d.f32(0);

    if (kind === KIND_FIELD || kind === KIND_FIELD_OPEN) {
      const sample = sampleField(item, input.local);
      cover = coverage(std.min(sample.x, sample.z));
    } else if (kind === KIND_TURRET) {
      const barrel = roundedBox(std.sub(input.local, d.vec2f(18.55, 0)), d.vec2f(11.25, 3.75), d.f32(1));
      cover = coverage(std.min(barrel, std.length(input.local) - 9.6));
    }

    return d.vec4f(cover * item.field.w * item.extra.x, 0, 0, 0);
  });

  const lightVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { position: d.builtin.position, world: d.vec2f, instance: d.interpolate('flat', d.u32) }
  })((input) => {
    'use gpu';
    const light = lights.$[input.instance]!;
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), light.shape.z);
    const world = std.add(light.shape.xy, offset);
    return { position: project(world), world, instance: input.instance };
  });

  /**
   * How much of a light reaches this pixel: a smooth falloff to zero at the light's radius, times 0
   * where something in the height map rises above the line from this pixel, at its own height, to
   * the light at the light's height. Returns the falloff and the visibility.
   */
  const lightReach = (pixel: d.v2f, world: d.v2f, instance: number) => {
    'use gpu';
    const light = lights.$[instance]!;
    const reach = std.saturate(1 - std.length(std.sub(world, light.shape.xy)) / light.shape.z);
    const size = d.vec2f(std.textureDimensions(occluderLayout.$.occluders));
    const lightClip = project(light.shape.xy);
    const lightPixel = d.vec2f((lightClip.x + 1) / 2 * size.x, (1 - lightClip.y) / 2 * size.y);
    const steps = std.clamp(d.i32(std.length(std.sub(lightPixel, pixel)) / 2), 1, MAX_SHADOW_STEPS);
    const height = std.textureLoad(occluderLayout.$.occluders, d.vec2i(std.floor(pixel)), 0).x;
    const lightHeight = light.color.w;
    let lit = d.f32(1);

    if (reach > 0 && height < lightHeight) {
      for (let step = d.i32(1); step <= steps; step++) {
        const t = d.f32(step) / d.f32(steps);
        const point = std.mix(pixel, lightPixel, t);
        const inside = std.clamp(d.vec2i(std.floor(point)), d.vec2i(0), std.sub(d.vec2i(size), 1));
        const rayHeight = std.mix(height, lightHeight, t);

        if (std.textureLoad(occluderLayout.$.occluders, inside, 0).x > rayHeight + SHADOW_BIAS) {
          lit = 0;
          break;
        }
      }
    }

    return d.vec2f(reach, lit);
  };

  /**
   * Adds one light to the light buffers. Within its reach a light claims a share of the ambient
   * light (`dim`, as dark as the sun's shadow, fading near its edge and with a dying light) and,
   * wherever it is not blocked, gives that share back (`light.a`) plus its own colored gain
   * (`light.rgb`). The buffers keep the strongest claim and sum the rest; applying them restores
   * at most what was claimed, so overlapping shadows do not stack, a pixel in one light's shadow
   * stays lit by another light, and overlapping lights never wash the scene out to white.
   */
  const lightAccumulateFragment = tgpu.fragmentFn({
    in: { position: d.builtin.position, world: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: { dim: d.location(0, d.vec4f), light: d.location(1, d.vec4f) }
  })((input) => {
    'use gpu';
    const light = lights.$[input.instance]!;
    const reach = lightReach(input.position.xy, input.world, input.instance);
    const dim = (1 - SUN_SHADE) * std.smoothstep(0, SHADOW_EDGE, reach.x) * std.saturate(light.shape.w * SHADOW_FULL_AT);
    const gain = reach.x * reach.x * light.shape.w * LIGHT_GAIN;
    return { dim: d.vec4f(dim, 0, 0, 0), light: d.vec4f(std.mul(light.color.xyz, gain * reach.y), dim * reach.y) };
  });

  /** First half of applying the light buffers: the scene loses the ambient light the lights claimed. */
  const lightDarkenFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const pixel = d.vec2i(std.floor(input.position.xy));
    const dim = std.textureLoad(lightLayout.$.dims, pixel, 0).x * (1 - keepsOwnLight(pixel));
    return d.vec4f(d.vec3f(1 - dim), 1);
  });

  /**
   * Second half: the scene gets back the ambient light lights gave back, at most what was claimed,
   * plus their colored light. Blending computes `scene * (1 + gain)`, so the gain is relative to
   * the darkened scene and capped at doubling it.
   */
  const lightBrightenFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const pixel = d.vec2i(std.floor(input.position.xy));
    const dim = std.textureLoad(lightLayout.$.dims, pixel, 0).x;
    const given = std.textureLoad(lightLayout.$.lights, pixel, 0);
    const restored = std.add(d.vec3f(std.min(given.w, dim)), given.xyz);
    const gain = std.min(std.div(restored, std.max(1 - dim, 0.05)), d.vec3f(1));
    return d.vec4f(std.mul(gain, 1 - keepsOwnLight(pixel)), 0);
  });

  /**
   * Glow of the air around a light, added on top. Shadowed air does not glow, so bodies cut shafts
   * through it, and smoke plumes above hide it.
   */
  const lightGlowFragment = tgpu.fragmentFn({
    in: { position: d.builtin.position, world: d.vec2f, instance: d.interpolate('flat', d.u32) },
    out: d.vec4f
  })((input) => {
    'use gpu';
    const light = lights.$[input.instance]!;
    const reach = lightReach(input.position.xy, input.world, input.instance);
    const plume = plumeOpacity(d.vec2i(std.floor(input.position.xy)));
    const glow = reach.x * reach.x * reach.x * reach.y * light.shape.w * LIGHT_GLOW * (1 - plume);
    return d.vec4f(std.mul(light.color.xyz, glow), 0);
  });

  /** `scene * (1 + light)`: lights brighten what they fall on without lifting black. */
  const lightBlend = {
    color: { srcFactor: 'dst', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' }
  } as const;

  /** `scene * factor`. */
  const multiplyBlend = {
    color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' }
  } as const;

  const advanceParticles = root.createGuardedComputePipeline((index: number) => {
    'use gpu';
    const particle = particles.$[index]!;

    if (particle.life.x >= particle.life.y) {
      return;
    }

    const dt = simulation.$.dt;
    const kind = d.u32(particle.life.w);
    let drag = d.f32(1.2);

    if (kind === PARTICLE_SPARK) {
      drag = 5;
    } else if (kind === PARTICLE_DUST) {
      drag = 3;
    } else if (kind === PARTICLE_FIRE) {
      drag = 2.5;
    } else if (kind === PARTICLE_SOOT) {
      drag = 1.5;
    } else if (kind === PARTICLE_SMOKE) {
      drag = 2.2;
    }

    const velocity = std.mul(particle.motion.zw, std.exp(-drag * dt));
    particles.$[index] = Particle({
      motion: d.vec4f(std.add(particle.motion.xy, std.mul(velocity, dt)), velocity),
      life: d.vec4f(particle.life.x + dt, particle.life.yzw),
      color: particle.color
    });
  });

  const premultiplied = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
  } as const;
  const bodyPipeline = root.createRenderPipeline({
    vertex: bodyVertex,
    fragment: bodyFragment,
    targets: { format, blend: premultiplied }
  });
  const particlePipeline = root.createRenderPipeline({
    vertex: particleVertex,
    fragment: particleFragment,
    targets: { format, blend: premultiplied }
  });
  const puffPipeline = root.createRenderPipeline({
    vertex: puffVertex,
    fragment: puffFragment,
    targets: {
      format: PUFF_FORMAT,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }
      }
    }
  });
  const occluderPipeline = root.createRenderPipeline({
    vertex: bodyVertex,
    fragment: occluderFragment,
    targets: {
      format: OCCLUDER_FORMAT,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }
      }
    }
  });
  const lightAccumulatePipeline = root.createRenderPipeline({
    vertex: lightVertex,
    fragment: lightAccumulateFragment,
    targets: {
      dim: {
        format: LIGHT_DIM_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }
        }
      },
      light: {
        format: LIGHT_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
        }
      }
    }
  });
  const lightDarkenPipeline = root.createRenderPipeline({
    vertex: screenVertex,
    fragment: lightDarkenFragment,
    targets: { format, blend: multiplyBlend }
  });
  const lightBrightenPipeline = root.createRenderPipeline({
    vertex: screenVertex,
    fragment: lightBrightenFragment,
    targets: { format, blend: lightBlend }
  });
  const lightGlowPipeline = root.createRenderPipeline({
    vertex: lightVertex,
    fragment: lightGlowFragment,
    targets: { format, blend: premultiplied }
  });
  const trailPipeline = root.createRenderPipeline({
    vertex: trailVertex,
    fragment: trailFragment,
    targets: {
      format: PUFF_FORMAT,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }
      }
    }
  });
  const additive = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
  } as const;
  const plumePipeline = root.createRenderPipeline({
    vertex: plumeVertex,
    fragment: plumeFragment,
    targets: { format: PLUME_FORMAT, blend: premultiplied }
  });
  const plumeShadowPipeline = root.createRenderPipeline({
    vertex: plumeShadowVertex,
    fragment: plumeShadowFragment,
    targets: { format: SMOKE_SHADOW_FORMAT, blend: additive }
  });
  const smokePipeline = root.createRenderPipeline({
    vertex: screenVertex,
    fragment: smokeComposite,
    targets: { format, blend: premultiplied }
  });
  const sunPipeline = root.createRenderPipeline({
    vertex: screenVertex,
    fragment: sunShadowFragment,
    targets: { format, blend: multiplyBlend }
  });
  let targets: ReturnType<typeof createTargets> | undefined;

  /**
   * Screen-sized textures: puffs merged one layer per channel, smoke plumes and the density of
   * smoke over the ground, the height map for shadows, and the light buffers (strongest ambient
   * claim, summed light given back).
   */
  function createTargets(width: number, height: number) {
    const size: [number, number] = [width, height];
    const puffs = root.createTexture({ size, format: PUFF_FORMAT }).$usage('sampled', 'render');
    const occluders = root.createTexture({ size, format: OCCLUDER_FORMAT }).$usage('sampled', 'render');
    const lightDims = root.createTexture({ size, format: LIGHT_DIM_FORMAT }).$usage('sampled', 'render');
    const lightSums = root.createTexture({ size, format: LIGHT_FORMAT }).$usage('sampled', 'render');
    const smokeShadows = root.createTexture({ size, format: SMOKE_SHADOW_FORMAT }).$usage('sampled', 'render');
    const plume = root.createTexture({ size, format: PLUME_FORMAT }).$usage('sampled', 'render');
    return {
      width,
      height,
      textures: [puffs, occluders, lightDims, lightSums, smokeShadows, plume],
      puffView: root.unwrap(puffs).createView(),
      occluderView: root.unwrap(occluders).createView(),
      lightDimView: root.unwrap(lightDims).createView(),
      lightSumView: root.unwrap(lightSums).createView(),
      smokeShadowView: root.unwrap(smokeShadows).createView(),
      plumeView: root.unwrap(plume).createView(),
      puffGroup: root.createBindGroup(puffLayout, {
        puffs: puffs.createView(),
        smokeShadows: smokeShadows.createView(),
        plume: plume.createView()
      }),
      occluderGroup: root.createBindGroup(occluderLayout, { occluders: occluders.createView() }),
      lightGroup: root.createBindGroup(lightLayout, { dims: lightDims.createView(), lights: lightSums.createView() })
    };
  }

  const bodyData = new Float32Array(MAX_BODIES * BODY_FLOATS);
  const lightData = new Float32Array(MAX_LIGHTS * LIGHT_FLOATS);
  let lightCount = 0;
  const spawnData = new Float32Array(MAX_SPAWNS_PER_FRAME * PARTICLE_FLOATS);
  const freeSlots = Array.from({ length: FIELD_SLOTS }, (_, slot) => FIELD_SLOTS - 1 - slot);
  let bodyCount = 0;
  const plumeData = new Float32Array(MAX_PLUME_BALLS * PLUME_BALL_FLOATS);
  let plumeBallCount = 0;
  let time = 0;
  let nextParticle = 0;
  let spawnCount = 0;

  /** Writes the particles spawned since the last frame into the ring, in at most two runs. */
  function flushSpawns() {
    if (spawnCount === 0) {
      return;
    }

    const target = root.unwrap(particles.buffer);
    const firstRun = Math.min(spawnCount, MAX_PARTICLES - nextParticle);
    device.queue.writeBuffer(target, nextParticle * PARTICLE_FLOATS * 4, spawnData, 0, firstRun * PARTICLE_FLOATS);

    if (spawnCount > firstRun) {
      device.queue.writeBuffer(target, 0, spawnData, firstRun * PARTICLE_FLOATS, (spawnCount - firstRun) * PARTICLE_FLOATS);
    }

    nextParticle = (nextParticle + spawnCount) % MAX_PARTICLES;
    spawnCount = 0;
  }

  return {
    /** Reserves a field slot; returns `undefined` when all are taken. */
    allocateField() {
      return freeSlots.pop();
    },

    /** Returns a slot reserved by `allocateField`. */
    releaseField(slot: number) {
      freeSlots.push(slot);
    },

    /** Uploads `field` into `slot`; call after every change. */
    uploadField(slot: number, field: DamageField) {
      if (field.cols * field.rows > SLOT_CELLS) {
        throw new Error(`A ${field.cols} x ${field.rows} field does not fit a slot of ${SLOT_CELLS} cells.`);
      }

      device.queue.writeBuffer(root.unwrap(fields.buffer), slot * SLOT_CELLS * CHANNELS * 4, field.data);
    },

    /** Starts the frame's body and light lists; bodies draw in the order they are added. */
    beginBodies() {
      bodyCount = 0;
      lightCount = 0;
      plumeBallCount = 0;
    },

    /**
     * Adds a ball of a smoke plume to this frame; balls beyond the limit are dropped. Balls are laid
     * over each other in the order they are added, so add lower ones first, and keep the order of
     * overlapping balls from frame to frame: swapping two would make their overlap jump. The plume
     * covers everything on the ground, fire included, and its shadow darkens the ground like the
     * shadow of a body.
     */
    addSmokeBall(ball: SmokeBall) {
      if (plumeBallCount >= MAX_PLUME_BALLS) {
        return;
      }

      plumeData.set(
        [
          ball.seen.x,
          ball.seen.y,
          ball.seen.radius,
          ball.tone,
          ball.shadow.x,
          ball.shadow.y,
          ball.shadow.radius,
          0,
          ball.opacity,
          ball.softness,
          ball.heat,
          ball.turn
        ],
        plumeBallCount * PLUME_BALL_FLOATS
      );
      plumeBallCount++;
    },

    /**
     * Adds a point light to this frame. Bodies cast hard shadows from it.
     *
     * @param radius - Reach in world pixels.
     * @param intensity - Brightness, 0-1; also scales the darkening of its shadows.
     * @param color - Light color, components 0-1, added to what it lights.
     * @param height - Height of the light above the floor in pixels; bodies taller than the line
     *   to it cast shadows. Hulls are 6 px tall, crates 8 px and turrets 10 px.
     */
    addLight(x: number, y: number, radius: number, intensity: number, color: readonly number[], height: number) {
      if (lightCount >= MAX_LIGHTS) {
        return;
      }

      lightData.set([x, y, radius, intensity, color[0], color[1], color[2], height], lightCount * LIGHT_FLOATS);
      lightCount++;
    },

    /**
     * Adds a body to this frame.
     *
     * @param color - Fill color, components 0-1.
     * @param flash - Hit flash, 0-1, which whitens the body.
     * @param alpha - Overall opacity, for fading debris.
     * @param height - Height above the floor in pixels, for shadows; turrets default to 10, others to 6.
     */
    addBody(body: BodyDraw) {
      if (bodyCount >= MAX_BODIES) {
        return;
      }

      const offset = bodyCount * BODY_FLOATS;
      bodyData.set(
        [
          body.x,
          body.y,
          Math.cos(body.angle),
          Math.sin(body.angle),
          body.originX,
          body.originY,
          body.cell,
          body.alpha ?? 1,
          body.cols,
          body.rows,
          body.slot ?? 0,
          body.kind,
          body.color[0],
          body.color[1],
          body.color[2],
          body.flash ?? 0,
          body.height ?? (body.kind === KIND_TURRET ? TURRET_HEIGHT : body.kind === KIND_RECT ? 0 : HULL_HEIGHT),
          0,
          0,
          0
        ],
        offset
      );
      bodyCount++;
    },

    /**
     * Spawns a particle with the next frame, overwriting the oldest one when the ring is full.
     * Spawns beyond the per-frame limit are dropped.
     *
     * @param kind - One of the `PARTICLE_*` constants.
     * @param color - RGBA, components 0-1; alpha scales intensity for light.
     */
    spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, color: readonly number[]) {
      if (spawnCount >= MAX_SPAWNS_PER_FRAME) {
        return;
      }

      spawnData.set([x, y, vx, vy, 0, life, size, kind, color[0], color[1], color[2], color[3]], spawnCount * PARTICLE_FLOATS);
      spawnCount++;
    },

    /**
     * Advances particles by `dt` seconds and draws the frame.
     *
     * @param view - Camera center and rotation in world coordinates, zoom in screen pixels per world pixel.
     * @param viewport - Canvas size in CSS pixels, which `zoom` refers to.
     */
    render(
      view: { x: number; y: number; zoom: number; rotation: number },
      viewport: { width: number; height: number },
      background: readonly number[],
      dt: number
    ) {
      device.queue.writeBuffer(root.unwrap(bodies.buffer), 0, bodyData, 0, bodyCount * BODY_FLOATS);
      device.queue.writeBuffer(root.unwrap(lights.buffer), 0, lightData, 0, lightCount * LIGHT_FLOATS);
      device.queue.writeBuffer(root.unwrap(plumeBalls.buffer), 0, plumeData, 0, plumeBallCount * PLUME_BALL_FLOATS);
      camera.write({
        center: d.vec2f(view.x, view.y),
        zoom: view.zoom,
        rotation: d.vec2f(Math.cos(view.rotation), Math.sin(view.rotation)),
        viewport: d.vec2f(viewport.width, viewport.height)
      });
      time += dt;
      simulation.write({ dt, time });
      flushSpawns();

      const canvasTexture = gpu.context.getCurrentTexture();

      if (targets?.width !== canvasTexture.width || targets.height !== canvasTexture.height) {
        targets?.textures.forEach((texture) => texture.destroy());
        targets = createTargets(canvasTexture.width, canvasTexture.height);
      }

      const encoder = device.createCommandEncoder();
      advanceParticles.with(encoder).dispatchThreads(MAX_PARTICLES);

      const puffPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: targets.puffView,
            clearValue: { r: FAR_OUTSIDE, g: FAR_OUTSIDE, b: FAR_OUTSIDE, a: FAR_OUTSIDE },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });
      puffPipeline.with(puffPass).draw(6, MAX_PARTICLES);
      trailPipeline.with(puffPass).draw(6, MAX_PARTICLES);
      puffPass.end();

      const plumePass = encoder.beginRenderPass({
        colorAttachments: [{ view: targets.plumeView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
      });

      if (plumeBallCount > 0) {
        plumePipeline.with(plumePass).draw(6, plumeBallCount);
      }

      plumePass.end();

      const smokeShadowPass = encoder.beginRenderPass({
        colorAttachments: [
          { view: targets.smokeShadowView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }
        ]
      });

      if (plumeBallCount > 0) {
        plumeShadowPipeline.with(smokeShadowPass).draw(6, plumeBallCount);
      }

      smokeShadowPass.end();

      const occluderPass = encoder.beginRenderPass({
        colorAttachments: [{ view: targets.occluderView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
      });

      if (bodyCount > 0) {
        occluderPipeline.with(occluderPass).draw(6, bodyCount);
      }

      occluderPass.end();

      const lightPass = encoder.beginRenderPass({
        colorAttachments: [
          { view: targets.lightDimView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' },
          { view: targets.lightSumView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }
        ]
      });

      if (lightCount > 0) {
        lightAccumulatePipeline.with(lightPass).with(targets.occluderGroup).draw(6, lightCount);
      }

      lightPass.end();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: canvasTexture.createView(),
            clearValue: { r: background[0], g: background[1], b: background[2], a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      if (bodyCount > 0) {
        bodyPipeline.with(pass).draw(6, bodyCount);
      }

      sunPipeline.with(pass).with(targets.occluderGroup).with(targets.puffGroup).draw(3);
      smokePipeline.with(pass).with(targets.puffGroup).draw(3);

      if (lightCount > 0) {
        lightDarkenPipeline.with(pass).with(targets.lightGroup).with(targets.puffGroup).draw(3);
        lightBrightenPipeline.with(pass).with(targets.lightGroup).with(targets.puffGroup).draw(3);
        lightGlowPipeline.with(pass).with(targets.occluderGroup).with(targets.puffGroup).draw(6, lightCount);
      }

      particlePipeline.with(pass).draw(6, MAX_PARTICLES);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  };
}

/** One body to draw this frame. */
export type BodyDraw = {
  /** One of the `KIND_*` constants. */
  kind: number;
  x: number;
  y: number;
  angle: number;
  /** Local position of the center of the first cell; the quad starts half a cell before it. */
  originX: number;
  originY: number;
  cell: number;
  cols: number;
  rows: number;
  /** Field slot, for `KIND_FIELD`. */
  slot?: number;
  color: readonly number[];
  flash?: number;
  alpha?: number;
  height?: number;
};

/** A body shaded from its distance field, its core hidden under armor. */
export const KIND_FIELD = 0;

/** A turret, shaded from a formula in turret coordinates. */
export const KIND_TURRET = 1;

/** A plain filled rectangle, such as the floor. */
export const KIND_RECT = 2;

/** A body shaded from its distance field whose core shows through a hole. */
export const KIND_FIELD_OPEN = 3;

/** A tapered streak along its velocity. */
export const PARTICLE_SPARK = 0;

/**
 * A point of a shot trail. Consecutive points spawned with the same trail id (`color[1]`) are
 * joined by 5 px segments; `color[0]` runs from 0 at the muzzle to 1 at the end of the trail.
 */
export const PARTICLE_TRAIL = 1;

/** A puff of pale gun smoke that billows, then shrinks. Merges with other smoke into one outlined cloud. */
export const PARTICLE_SMOKE = 2;

/** A small hard chip of material. */
export const PARTICLE_DUST = 3;

/** A puff of dark soot that billows, then shrinks. Merges with other soot into one outlined cloud. */
export const PARTICLE_SOOT = 4;

/** A puff of fire. Merges like soot, drawn above it. */
export const PARTICLE_FIRE = 5;


/** Field cells per slot: enough for a 0.5 px hull or a 1 px crate. */
export const SLOT_CELLS = 96 * 64;

const FIELD_SLOTS = 256;
const MAX_BODIES = 1024;
const MAX_PARTICLES = 65536;
const MAX_SPAWNS_PER_FRAME = 4096;
const OUTLINE = 1;
const CORE_COLOR = d.vec3f(1, 0.55, 0.15);
const PUFF_FORMAT = 'rgba16float';
const OCCLUDER_FORMAT = 'r16float';
/**
 * The sun, for code on the CPU that casts shadows of its own: `direction` is where shadows fall in
 * world axes, toward the lower right, and `shadowLength` the shadow length per pixel of height,
 * for a sun about 50 degrees high.
 */
export const SUN = { direction: { x: 0.6, y: 0.8 }, shadowLength: 0.85 };
const SUN_DIRECTION = d.vec2f(SUN.direction.x, SUN.direction.y);
const SUN_SHADOW_LENGTH = SUN.shadowLength;
/** Brightness of ground in the sun's shadow. */
const SUN_SHADE = 0.72;
/** Tallest body that can cast a sun shadow, which bounds the walk toward the sun. */
const MAX_HEIGHT = 10;
const MAX_SUN_STEPS = 48;
/** Shadows of point lights fade in over this outer fraction of the light's reach. */
const SHADOW_EDGE = 0.35;
/** Shadow strength per unit of light intensity: lights of 0.4 and up shade as darkly as the sun, dimmer ones less. */
const SHADOW_FULL_AT = 2.5;
/** How far above the ray a height must be to cast a shadow, against noise in antialiased edges. */
const SHADOW_BIAS = 0.25;
const HULL_HEIGHT = 6;
const TURRET_HEIGHT = 10;
const MAX_LIGHTS = 32;
/** Most samples of the occluder mask between a pixel and a light, one every 2 screen pixels. */
const MAX_SHADOW_STEPS = 256;
/** Brightening of surfaces at the center of a light of intensity 1. */
const LIGHT_GAIN = 1.8;
/** Glow of the air at the center of a light of intensity 1. */
const LIGHT_GLOW = 0.3;
const occluderLayout = tgpu.bindGroupLayout({ occluders: { texture: d.texture2d(d.f32) } });
const LIGHT_DIM_FORMAT = 'r16float';
const LIGHT_FORMAT = 'rgba16float';
const lightLayout = tgpu.bindGroupLayout({
  dims: { texture: d.texture2d(d.f32) },
  lights: { texture: d.texture2d(d.f32) }
});
const TRAIL_WIDTH = 5;
const TRAIL_COLOR = d.vec3f(0.72);
/** Soot facing away from the sun, and facing it: charcoal with paler sunlit tops. */
const SOOT_SHADE = d.vec3f(0.13, 0.13, 0.14);
const SOOT_LIGHT = d.vec3f(0.33, 0.32, 0.31);
/** Lumps on soot, in world pixels: small ones on the outline, large ones only in the shading. */
const SOOT_LUMP_SMALL = 1.4;
const SOOT_LUMP_LARGE = 4;
/** Drift of the lumps, in world pixels per second, so smoke boils. */
const SOOT_BOIL = d.vec2f(1.5, -1.1);
/** Fire: deep orange at its edge, yellow inside, with a dark red outline. */
const FIRE_EDGE = d.vec3f(1, 0.36, 0.08);
const FIRE_CORE = d.vec3f(1, 0.85, 0.45);
const FIRE_OUTLINE = d.vec3f(0.4, 0.06, 0.02);
/** Distance written where there is no puff; must stay within half-float range. */
const FAR_OUTSIDE = -1000;
const puffLayout = tgpu.bindGroupLayout({
  puffs: { texture: d.texture2d(d.f32) },
  smokeShadows: { texture: d.texture2d(d.f32) },
  plume: { texture: d.texture2d(d.f32) }
});
/** Density of plume smoke over the ground, summed over the balls' shadows. */
const SMOKE_SHADOW_FORMAT = 'r16float';
/** Opacity of a smoke shadow per unit of density. */
const SMOKE_SHADOW_DENSITY = 3;
/** Plumes, premultiplied: shade, heat, ink, opacity. */
const PLUME_FORMAT = 'rgba16float';
/**
 * Style of smoke plumes: soft shaded billows, as on satellite photos (`false`), or billows in flat
 * tones with an ink outline each, like the vector art of the bodies (`true`).
 */
const PLUME_INKED = false;
/** Width of the ink outline of a billow in world pixels, and its color. */
const PLUME_INK_WIDTH = 0.8;
const PLUME_INK = d.vec3f(0.02);
/** Opacity of a ball below which an inked ball turns soft; fully inked at opacity 1. */
const PLUME_INKED_FROM = 0.7;
const PLUME_MIN_OPACITY = 0.002;
/** Unit vector toward the sun in world axes, with z up: shadows fall `SUN.shadowLength` per unit of height. */
const SUN_TOWARD = std.normalize(d.vec3f(-SUN.direction.x, -SUN.direction.y, 1 / SUN.shadowLength));
/**
 * Share of a ball's light that comes from the sun; the rest is sky. Both dim toward its rim, to
 * `PLUME_RIM`, where neighbours crowd it. The sun lights only parts turned toward it further than
 * `PLUME_TERMINATOR`, the cosine of the angle to it, so billows show a bright and a dark side.
 */
const PLUME_SUNLIGHT = 0.9;
const PLUME_RIM = 0.3;
const PLUME_TERMINATOR = 0.45;
/** How far a ball's rim bulges in and out, as a share of its radius. */
const PLUME_LUMPS = 0.12;
/** How far noise frays a soft edge, as a share of its width, and how fine the noise is across a ball. */
const PLUME_FRAY = 1.2;
const PLUME_FRAY_SCALE = 2.5;
/** Shadows of balls fall off over at least this outer fraction of their radius. */
const PLUME_SHADOW_SOFTNESS = 0.6;
/** Plume smoke in its own shade and fully sunlit, after satellite photos of burning oil: charcoal with grey tops. */
const PLUME_SHADE = d.vec3f(0.035, 0.035, 0.04);
const PLUME_LIGHT = d.vec3f(0.56, 0.55, 0.53);
/** Glow added to smoke right above the flames. */
const PLUME_HEAT = d.vec3f(0.3, 0.1, 0.02);

const Camera = d.struct({
  center: d.vec2f,
  rotation: d.vec2f,
  viewport: d.vec2f,
  zoom: d.f32
});

const Simulation = d.struct({ dt: d.f32, time: d.f32 });

/**
 * One body on screen, as five vec4s so the CPU can pack it by hand:
 * `placement` = position, cos and sin of the angle; `field` = first cell center, cell size, alpha;
 * `grid` = columns, rows, field slot, kind; `color` = fill RGB and hit flash; `extra` = height.
 */
const BodyInstance = d.struct({
  placement: d.vec4f,
  field: d.vec4f,
  grid: d.vec4f,
  color: d.vec4f,
  extra: d.vec4f
});
const BODY_FLOATS = 20;

/** `motion` = position and velocity; `life` = age, lifetime, size, kind; `color` = RGBA. */
const Particle = d.struct({
  motion: d.vec4f,
  life: d.vec4f,
  color: d.vec4f
});
const PARTICLE_FLOATS = 12;

/** A ball of a smoke plume. Lengths are in world pixels. */
export type SmokeBall = {
  /** Center as seen from the camera, and how large its radius looks there. */
  seen: { x: number; y: number; radius: number };
  /** Where the ball's shadow falls on the ground, and the ball's true radius. */
  shadow: { x: number; y: number; radius: number };
  /** Opacity at the middle, 0-1. */
  opacity: number;
  /** Outer fraction of the radius over which the opacity falls to 0, from 0 (a hard edge) to 1. */
  softness: number;
  /** How strongly the flames below light the ball, 0-1. */
  heat: number;
  /** Angle in radians that turns the lumps of its rim; change it slowly to roll the ball. */
  turn: number;
  /** Brightness of its smoke, about 1; also picks the noise that frays its edge, so give neighbours different tones. */
  tone: number;
};

/**
 * A ball of a smoke plume: `seen` = center as seen from the camera, apparent radius, tone;
 * `shadow` = where its shadow falls on the ground, true radius, unused; `look` = opacity,
 * softness, heat, turn.
 */
const PlumeBall = d.struct({
  seen: d.vec4f,
  shadow: d.vec4f,
  look: d.vec4f
});
const PLUME_BALL_FLOATS = 12;
const MAX_PLUME_BALLS = 8192;

/** `shape` = position, radius, intensity; `color` = RGB and the light's height. */
const Light = d.struct({
  shape: d.vec4f,
  color: d.vec4f
});
const LIGHT_FLOATS = 8;
