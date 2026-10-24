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
 * - Smoke: balls of smoke that the CPU places anew every frame where they are in the air, so the
 *   renderer knows nothing of their motion. The camera looks down from `CAMERA_HEIGHT`, so a ball
 *   appears pushed away from the middle of the view and larger the higher it is, and smoke shifts
 *   against the ground as the camera moves. The styles of `SMOKE_STYLES` differ only in how a
 *   ball shapes the cloud's top surface and how the composite colours it; every style draws
 *   1. the top surface of all balls, kept by a depth test: its height, normal and distance to the
 *      nearest rim, and the ball's heat and tone. Ink and poster balls are domes, paper balls flat
 *      discs at the height of their parcel. This and the light below are drawn at about one texel
 *      per CSS pixel and sampled smoothly, so edges stay crisp;
 *   2. a veil at half that resolution, which averages the balls' opacity and heat under smooth
 *      weights, so thinning smoke fades as one translucent tone and never shows its balls;
 *   3. how the sun lights the surface, walking toward the sun over its heights for the shadows
 *      that taller smoke casts on smoke behind it;
 *   4. the colour, in the composite: light posterized into flat tones, outlines or cut edges at
 *      the rims, the glow of the flames below, the veil's opacity.
 *   The same balls, cast along the sun, sum their density into a smoke shadow map.
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
 * drawn under the smoke but keeps its own brightness through the light passes; smoke hangs high
 * above the lights and keeps its own shading too; sparks are drawn after all shading.
 *
 * Bodies keep the look of a vector illustration with hard outlines. Puffs of gun smoke and fire
 * are not drawn one by one: each is written as a distance into a screen-sized texture with `max`
 * blending, which merges overlapping puffs into one shape per layer, and a full-screen pass then
 * fills each layer and outlines its merged contour. Shot trails go into the same texture as
 * coverage, so the joints of a trail's segments never darken where they overlap.
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
  const smokeStyle = root.createUniform(d.u32);

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

  /**
   * Signed distance to part `part` of a turret of `style` (one of the `TURRET_*` constants) at a
   * local point, +x along the barrel. Parts are drawn in order, so later ones overlap earlier ones;
   * parts a style lacks lie `TURRET_FAR` away. `spin` turns the gatling's barrels about their axis.
   */
  const turretPart = (point: d.v2f, style: number, part: number, spin: number) => {
    'use gpu';
    let distance = d.f32(TURRET_FAR);

    if (style === TURRET_TWIN) {
      // The light tank: a small cupola with two short barrels side by side.
      if (part === 0) {
        const upper = roundedBox(std.sub(point, d.vec2f(14, -2.9)), d.vec2f(8, 1.7), 0.8);
        const lower = roundedBox(std.sub(point, d.vec2f(14, 2.9)), d.vec2f(8, 1.7), 0.8);
        distance = std.min(upper, lower);
      } else if (part === 1) {
        distance = std.length(point) - 7.2;
      }
    } else if (style === TURRET_GATLING) {
      // The heavy tank: a broad turret, the gun's drum in front of it and four barrels turning in a cluster.
      if (part === 0) {
        distance = roundedBox(std.sub(point, d.vec2f(-1, 0)), d.vec2f(12, 10.5), d.f32(4));
      } else if (part === 1) {
        distance = roundedBox(std.sub(point, d.vec2f(15, 0)), d.vec2f(5.5, 5.4), 1.5);
      } else if (part === 2) {
        let barrels = d.f32(TURRET_FAR);

        for (let barrel = d.u32(0); barrel < 4; barrel++) {
          const across = std.sin(spin + d.f32(barrel) * 1.5707963) * 3.1;
          barrels = std.min(barrels, roundedBox(std.sub(point, d.vec2f(26, across)), d.vec2f(7, 1.05), 0.5));
        }

        distance = barrels;
      } else {
        distance = roundedBox(std.sub(point, d.vec2f(30.5, 0)), d.vec2f(1.3, 4.6), 0.6);
      }
    } else if (style === TURRET_MORTAR) {
      // The grenadier: a cupola with a short, fat mortar tube and a lip at its mouth.
      if (part === 0) {
        distance = roundedBox(std.sub(point, d.vec2f(12, 0)), d.vec2f(6.5, 6.2), d.f32(2.5));
      } else if (part === 1) {
        distance = roundedBox(std.sub(point, d.vec2f(18.8, 0)), d.vec2f(2, 7.6), d.f32(1.2));
      } else if (part === 2) {
        distance = std.length(point) - 9.2;
      }
    } else if (style === TURRET_CASEMATE) {
      // A casemate gun's fixed superstructure, turned with the hull, with the slope of its plates.
      if (part === 0) {
        distance = roundedBox(std.sub(point, d.vec2f(3, 0)), d.vec2f(12, 10), 2.5);
      } else if (part === 1) {
        distance = std.abs(roundedBox(std.sub(point, d.vec2f(4, 0)), d.vec2f(7.5, 6.2), 1.5)) - 0.5;
      }
    } else if (style === TURRET_LONG_GUN) {
      // A casemate gun's long barrel with a muzzle brake, from a mantlet in the casemate's face.
      if (part === 0) {
        distance = roundedBox(std.sub(point, d.vec2f(28, 0)), d.vec2f(20, 2.4), d.f32(1));
      } else if (part === 1) {
        distance = roundedBox(std.sub(point, d.vec2f(47, 0)), d.vec2f(2.6, 3.9), 0.8);
      } else if (part === 2) {
        distance = roundedBox(std.sub(point, d.vec2f(9, 0)), d.vec2f(4, 5.6), d.f32(2));
      }
    } else if (part === 0) {
      // The medium tank: a cupola and one barrel.
      distance = roundedBox(std.sub(point, d.vec2f(18.55, 0)), d.vec2f(11.25, 3.75), d.f32(1));
    } else if (part === 1) {
      distance = std.length(point) - 9.6;
    }

    return distance;
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
      const fill = std.mix(item.color.xyz, d.vec3f(1), flash * 0.6);
      const style = d.u32(item.extra.y);

      // Parts are drawn back to front, each with its own outline, so a cupola overlaps its barrel.
      for (let part = d.u32(0); part < TURRET_PARTS; part++) {
        const distance = turretPart(input.local, style, part, item.extra.z);
        result = over(result, std.mix(fill, black, edgeBand(distance, d.f32(OUTLINE))), coverage(distance));
      }
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
    return kind === PARTICLE_SMOKE || kind === PARTICLE_FIRE;
  };

  /** Current radius of a puff: smoke billows, then shrinks away; fire flares and dies fast. */
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
      FAR_OUTSIDE,
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

  /**
   * Where something `height` world pixels above the ground point `ground` appears to the camera,
   * which looks straight down from `CAMERA_HEIGHT` above the middle of the view: pushed away from
   * the middle and enlarged by the returned scale (`z`). This is the parallax of smoke against the
   * ground, which shows as the camera moves.
   */
  const seenFromCamera = (ground: d.v2f, height: number) => {
    'use gpu';
    const scale = CAMERA_HEIGHT / std.max(CAMERA_HEIGHT - height, 1);
    const center = camera.$.center;
    return d.vec3f(std.add(center, std.mul(std.sub(ground, center), scale)), scale);
  };

  /** Quad around a ball of smoke as the camera sees it, with what every style needs to shade it (`PLUME_VARYING`). */
  const plumeVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: PLUME_VARYING
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    const radius = ball.place.w;
    // Paper lays all balls of a parcel flat at the height of its body.
    const height = std.select(ball.place.z, ball.bodyHeight, smokeStyle.$ === SMOKE_PAPER);
    const seen = seenFromCamera(ball.place.xy, height);
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), radius * seen.z * PLUME_REACH + PLUME_EDGE_BAND + 1);
    return {
      position: project(std.add(seen.xy, offset)),
      offset,
      ball: d.vec3f(height, radius * seen.z, radius),
      look: ball.look,
      rim: rimPhases(ball.look.zw)
    };
  });

  /** Quad around the shadow a ball of smoke casts on the ground along the sun, as large as the ball. */
  const plumeShadowVertex = tgpu.vertexFn({
    in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: SHADOW_VARYING
  })((input) => {
    'use gpu';
    const ball = plumeBalls.$[input.instance]!;
    const center = std.add(ball.place.xy, std.mul(SUN_DIRECTION, ball.place.z * SUN_SHADOW_LENGTH));
    const offset = std.mul(std.sub(std.mul(quadCorner(input.vertex), 2), 1), ball.place.w * PLUME_REACH + 1);
    return {
      position: project(std.add(center, offset)),
      offset,
      radius: ball.place.w,
      look: ball.look,
      rim: rimPhases(ball.look.zw)
    };
  });

  /** Adds a ball's shadow to the density of smoke over the ground; shadows are softer than the balls. */
  const plumeShadowFragment = tgpu.fragmentFn({
    in: SHADOW_FRAGMENT_IN,
    out: d.vec4f
  })((input) => {
    'use gpu';
    const r = std.length(input.offset) / (input.radius * plumeRim(input.offset, input.rim));
    const density = std.smoothstep(1, 1 - PLUME_SHADOW_SOFTNESS, r) * input.look.x;

    if (density <= 0) {
      std.discard();
    }

    return d.vec4f(density, 0, 0, 0);
  });

  /**
   * Reach of a ball's rim toward `offset`, as a share of its radius: lumpy rather than round, by up
   * to `PLUME_LUMPS` either way. The lumps are three, five and seven waves around the rim at the
   * phases of `rimPhases`, taken as polynomials of the direction so they cost no trigonometry.
   */
  const plumeRim = (offset: d.v2f, phases: d.v4f) => {
    'use gpu';
    const length = std.length(offset);
    const direction = std.select(d.vec2f(1, 0), std.div(offset, length), length > 0.0001);
    const x = direction.x;
    const y = direction.y;
    const x2 = x * x;
    const y2 = y * y;
    const wave3 = x * (4 * x2 - 3) * phases.x - y * (3 - 4 * y2) * phases.y;
    const wave5 = x * (16 * x2 * x2 - 20 * x2 + 5) * phases.z - y * (16 * y2 * y2 - 20 * y2 + 5) * phases.w;
    const cos7 = x * (((64 * x2 - 112) * x2 + 56) * x2 - 7);
    const sin7 = y * (7 - (56 - (112 - 64 * y2) * y2) * y2);
    const wave7 = cos7 * (phases.x * phases.z - phases.y * phases.w) - sin7 * (phases.y * phases.z + phases.x * phases.w);
    return 1 + PLUME_LUMPS * (wave3 * 0.55 + wave5 * 0.3 + wave7 * 0.15);
  };

  /**
   * Phases of the waves around a ball's rim (`plumeRim`) as cosine and sine pairs, picked by the
   * ball's tone and turned by its turn (`toneTurn`), so neighbours differ and a ball rolls as its
   * turn changes. Taken once per ball, in the vertex stage.
   */
  const rimPhases = (toneTurn: d.v2f) => {
    'use gpu';
    const three = toneTurn.y * 3 + toneTurn.x * 41;
    const five = toneTurn.x * 73 - toneTurn.y * 6.5;
    return d.vec4f(std.cos(three), std.sin(three), std.cos(five), std.sin(five));
  };

  /**
   * Ink style: a billow is a squashed dome; the camera sees the top surface of all billows, as a
   * depth test keeps the highest. Writes that surface's height, its normal and the billow's opacity
   * (`shape`), and how far inside the billow's rim the point lies, its heat and tone (`surface`).
   */
  const inkBillowFragment = tgpu.fragmentFn({
    in: PLUME_FRAGMENT_IN,
    out: { shape: d.location(0, d.vec4f), surface: d.location(1, d.vec4f), depth: d.builtin.fragDepth }
  })((input) => {
    'use gpu';
    // Corners of the quad beyond any rim and its edge band skip the noise.
    if (std.length(input.offset) > input.ball.y * PLUME_REACH + PLUME_EDGE_BAND) {
      std.discard();
    }

    const reach = input.ball.y * plumeRim(input.offset, input.rim);
    const distance = std.length(input.offset);
    const inside = reach - distance;

    if (inside < -PLUME_EDGE_BAND) {
      std.discard();
    }

    const r = std.min(distance / reach, 1);
    const dome = std.sqrt(std.max(1 - r * r, 0));
    const top = input.ball.x + input.ball.z * INK_DOME * dome;
    // Light sees the dome rounder at its rim than in its middle, so a billow is mostly one flat tone.
    const normal = std.normalize(d.vec3f(std.mul(std.div(input.offset, reach), INK_ROUNDNESS * r), dome));
    return {
      shape: d.vec4f(top, normal.x, normal.y, input.look.x),
      surface: d.vec4f(inside, input.look.y, input.look.z, 0),
      depth: plumeDepth(top, input.look.x, inside)
    };
  });

  /**
   * Depth of a ball's surface `top` world pixels up, `inside` world pixels inside its rim: higher
   * wins, and denser smoke wins over thinner smoke up to `PLUME_DENSE_LEAD` higher, so thinning
   * smoke that drifts over thick smoke never shows through it. Points in the band just outside a
   * rim lose to any ball, and among themselves the one nearest a rim wins: the plume textures are
   * drawn at a lower resolution and sampled smoothly, so the distance to the rim must carry on a
   * little past the edge for the edge to come out smooth.
   */
  const plumeDepth = (top: number, opacity: number, inside: number) => {
    'use gpu';
    const surface = 0.9 * std.saturate(1 - (top + opacity * PLUME_DENSE_LEAD) / PLUME_DEPTH_RANGE);
    return std.select(surface, 0.92 + 0.07 * std.saturate(-inside / PLUME_EDGE_BAND), inside <= 0);
  };

  /**
   * Poster style: a billow is a round dome warped by waves that roll with it, so billows are
   * irregular rather than round. Writes the top surface like the ink style.
   */
  const posterBillowFragment = tgpu.fragmentFn({
    in: PLUME_FRAGMENT_IN,
    out: { shape: d.location(0, d.vec4f), surface: d.location(1, d.vec4f), depth: d.builtin.fragDepth }
  })((input) => {
    'use gpu';
    // Corners of the quad beyond any rim and its edge band skip the noise.
    if (std.length(input.offset) > input.ball.y * PLUME_REACH + PLUME_EDGE_BAND) {
      std.discard();
    }

    const local = std.div(input.offset, input.ball.y);
    const phase = input.look.z * 53 + input.look.w;
    const warp = d.vec2f(std.sin(local.y * 2.3 + phase), std.sin(local.x * 2.9 + phase * 1.7));
    const warped = std.add(local, std.mul(warp, POSTER_WARP * 0.5));
    const reach = plumeRim(warped, input.rim);
    const r = std.min(std.length(warped) / reach, 1);
    const inside = (reach - std.length(warped)) * input.ball.y;
    const dome = std.sqrt(std.max(1 - r * r, 0));
    const top = input.ball.x + input.ball.z * POSTER_DOME * dome;
    const normal = std.normalize(d.vec3f(std.div(warped, reach), dome));

    if (inside < -PLUME_EDGE_BAND) {
      std.discard();
    }

    return {
      shape: d.vec4f(top, normal.x, normal.y, input.look.x),
      surface: d.vec4f(inside, input.look.y, input.look.z, 0),
      depth: plumeDepth(top, input.look.x, inside)
    };
  });

  /**
   * Paper style: a ball is a flat disc with a lumpy rim at the height of its parcel's body, so the
   * balls of a parcel merge into one cut-out sheet. Writes the sheet like the ink style writes its
   * top surface, and how squarely the rim faces the sun (`surface.w`); within a sheet the point
   * deepest inside a disc wins, so its distance to the rim is the distance to the sheet's edge.
   */
  const paperSheetFragment = tgpu.fragmentFn({
    in: PLUME_FRAGMENT_IN,
    out: { shape: d.location(0, d.vec4f), surface: d.location(1, d.vec4f), depth: d.builtin.fragDepth }
  })((input) => {
    'use gpu';
    // Corners of the quad beyond any rim and its edge band skip the noise.
    if (std.length(input.offset) > input.ball.y * PLUME_REACH + PLUME_EDGE_BAND) {
      std.discard();
    }

    const distance = std.length(input.offset);
    const inside = input.ball.y * plumeRim(input.offset, input.rim) - distance;

    if (inside < -PLUME_EDGE_BAND) {
      std.discard();
    }

    // How squarely the disc's rim here faces the sun, for the cut edge.
    const facing = std.dot(std.div(input.offset, std.max(distance, 0.0001)), std.neg(SUN_DIRECTION));
    return {
      shape: d.vec4f(input.ball.x, 0, 0, input.look.x),
      surface: d.vec4f(inside, input.look.y, input.look.z, facing),
      depth: plumeDepth(input.ball.x + std.max(inside, 0) * PAPER_MERGE, input.look.x, inside)
    };
  });

  /**
   * Every style: adds a ball's opacity and heat, weighted by a smooth bump over its reach, so that
   * their averages vary smoothly across the plume and fading parcels do not show as discs.
   */
  const veilFragment = tgpu.fragmentFn({ in: PLUME_FRAGMENT_IN, out: d.vec4f })((input) => {
    'use gpu';
    const r = std.length(input.offset) / (input.ball.y * PLUME_REACH);

    if (r >= 1) {
      std.discard();
    }

    const weight = std.pow(1 - r * r, 2);
    return d.vec4f(input.look.x * weight, weight, input.look.y * weight, 0);
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

  /** Plume texels per world pixel: plume textures are drawn at a lower resolution than the canvas. */
  const texelsPerWorld = () => {
    'use gpu';
    return camera.$.zoom * (d.f32(std.textureDimensions(puffLayout.$.plume).x) / camera.$.viewport.x);
  };

  /** Where the canvas point `point`, in canvas pixels, lies on textures that cover the canvas, at any resolution. */
  const canvasUv = (point: d.v2f) => {
    'use gpu';
    return std.div(point, d.vec2f(std.textureDimensions(puffLayout.$.puffs)));
  };

  /** Samples `texture`, which covers the canvas at any resolution, smoothly at the canvas pixel `pixel`. */
  const sampleAt = (texture: typeof puffLayout.$.plume, pixel: d.v2i) => {
    'use gpu';
    return std.textureSampleLevel(texture, puffLayout.$.smooth, canvasUv(std.add(d.vec2f(pixel), 0.5)), 0);
  };

  /** Loads the plume texel `texel` moved by `step` texels, clamped to the texture. */
  const plumeTexel = (texel: d.v2i, step: d.v2i) => {
    'use gpu';
    const last = std.sub(d.vec2i(std.textureDimensions(puffLayout.$.plume)), 1);
    return std.textureLoad(puffLayout.$.plume, std.clamp(std.add(texel, step), d.vec2i(0), last), 0);
  };

  /** Loads the plume surface texel `texel` moved by `step` texels, clamped to the texture. */
  const surfaceTexel = (texel: d.v2i, step: d.v2i) => {
    'use gpu';
    const last = std.sub(d.vec2i(std.textureDimensions(puffLayout.$.plumeSurface)), 1);
    return std.textureLoad(puffLayout.$.plumeSurface, std.clamp(std.add(texel, step), d.vec2i(0), last), 0);
  };

  /** Averaged opacity (`x`) and heat (`y`) of the smoke at a canvas pixel, from the veil. */
  const plumeVeil = (pixel: d.v2i) => {
    'use gpu';
    const veil = sampleAt(puffLayout.$.plumeVeil, pixel);
    return std.div(d.vec2f(veil.x, veil.z), std.max(veil.y, 0.0001));
  };

  /**
   * How the sun lights the plume at each plume texel, drawn into the plume light texture once per
   * frame at the plume's resolution, so the composite only samples it: for the ink and poster
   * styles how much light falls there, 0-1, as far as it faces the sun and no taller smoke toward
   * the sun shades it; for the paper style how far higher sheets shade it.
   */
  const plumeLightFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const texel = d.vec2i(std.floor(input.position.xy));
    const shape = plumeTexel(texel, d.vec2i(0));
    const surface = surfaceTexel(texel, d.vec2i(0));

    // Texels outside every ball light nothing.
    if (surface.x < -PLUME_EDGE_BAND) {
      return d.vec4f(0);
    }

    if (smokeStyle.$ === SMOKE_PAPER) {
      return d.vec4f(paperShadow(texel, shape.x), 0, 0, 0);
    }

    const billow = d.vec3f(shape.y, shape.z, std.sqrt(std.saturate(1 - shape.y * shape.y - shape.z * shape.z)));
    let normal = d.vec3f(billow);
    let shading = d.f32(1);

    if (smokeStyle.$ === SMOKE_POSTER) {
      normal = std.normalize(std.mix(plumeMass(input.position.xy), billow, POSTER_BILLOWS));
      shading = POSTER_SHADE;
    }

    const light = std.saturate(std.dot(normal, SUN_TOWARD)) * (1 - plumeSelfShadow(texel, shape.x) * shading);
    return d.vec4f(light, 0, 0, 0);
  });

  /**
   * Normal of the cloud as one mass at the plume texel at `point`, in world axes: the veil's summed
   * weight taken as a height, `POSTER_RELIEF` world pixels per unit, so the cloud is a soft mound
   * that thins toward its edges.
   */
  const plumeMass = (point: d.v2f) => {
    'use gpu';
    const size = d.vec2f(std.textureDimensions(puffLayout.$.plume));
    const across = veilAt(std.add(point, d.vec2f(2, 0)), size) - veilAt(std.sub(point, d.vec2f(2, 0)), size);
    const down = veilAt(std.add(point, d.vec2f(0, 2)), size) - veilAt(std.sub(point, d.vec2f(0, 2)), size);
    const rotation = camera.$.rotation;
    const slope = std.mul(rotate(d.vec2f(across, down), d.vec2f(rotation.x, -rotation.y)), texelsPerWorld() * 0.25 * POSTER_RELIEF);
    return std.normalize(d.vec3f(std.neg(slope), 1));
  };

  /** Summed weight of the veil at `point` on a texture of `size` texels covering the canvas. */
  const veilAt = (point: d.v2f, size: d.v2f) => {
    'use gpu';
    return std.textureSampleLevel(puffLayout.$.plumeVeil, puffLayout.$.smooth, std.div(point, size), 0).y;
  };

  /**
   * How far the plume shades itself at the plume texel `texel`, whose top is `height` world pixels
   * up, from 0 (in the sun) to 1 (shaded). Walks toward the sun over the plume's height map
   * (`plume.x`) and measures how far the tallest point in the way rises above the line to the sun;
   * the shadow's edge is smoothed over a world pixel of that rise.
   */
  const plumeSelfShadow = (texel: d.v2i, height: number) => {
    'use gpu';
    const towardSun = std.mul(rotate(std.neg(SUN_DIRECTION), camera.$.rotation), texelsPerWorld());
    let rise = d.f32(-1);

    for (let step = 1; step <= PLUME_SHADOW_STEPS; step++) {
      const distance = (PLUME_SHADOW_REACH * d.f32(step)) / PLUME_SHADOW_STEPS;
      const other = plumeTexel(texel, d.vec2i(std.round(std.mul(towardSun, distance)))).x;
      rise = std.max(rise, other - height - distance / SUN_SHADOW_LENGTH);
    }

    return std.smoothstep(0, 1, rise);
  };

  /**
   * How far higher paper sheets shade the sheet at the plume texel `texel`, `height` world pixels
   * up, 0-1: walks toward the sun and, where a higher sheet lies, measures from that sheet's edge,
   * so the shadow keeps its sheet's outline exactly. Its edge is smoothed over
   * `PAPER_SHADOW_SOFTNESS` of height.
   */
  const paperShadow = (texel: d.v2i, height: number) => {
    'use gpu';
    const towardSun = std.mul(rotate(std.neg(SUN_DIRECTION), camera.$.rotation), texelsPerWorld());
    let rise = d.f32(-1);

    for (let step = 1; step <= PAPER_SHADOW_STEPS; step++) {
      const distance = d.f32(step) * PAPER_SHADOW_STEP;
      const at = d.vec2i(std.round(std.mul(towardSun, distance)));
      const other = plumeTexel(texel, at);
      const edge = std.max(distance - surfaceTexel(texel, at).x, 0);
      rise = std.max(rise, std.select(-1, other.x - height - edge / SUN_SHADOW_LENGTH, other.w > 0));
    }

    return std.smoothstep(0, PAPER_SHADOW_SOFTNESS, rise);
  };

  /**
   * Three flat tones by `light`, 0-1, stepping up at `steps.x` and `steps.y`. Light comes from a
   * texture at a lower resolution, sampled smoothly, so the steps run as smooth curves; they are
   * antialiased over about a canvas pixel.
   */
  const posterize = (light: number, dark: d.v3f, middle: d.v3f, bright: d.v3f, steps: d.v2f) => {
    'use gpu';
    const width = std.fwidth(light) * 0.5 + 0.001;
    const toMiddle = std.smoothstep(steps.x - width, steps.x + width, light);
    const toBright = std.smoothstep(steps.y - width, steps.y + width, light);
    return std.mix(std.mix(dark, middle, toMiddle), bright, toBright);
  };

  /**
   * How much of its light and shade smoke of opacity `opacity` shows: thinning smoke flattens into
   * one translucent tone, so billows do not show through each other as it fades.
   */
  const plumeDetail = (opacity: number) => {
    'use gpu';
    return std.smoothstep(PLUME_FLAT_BELOW, 1, opacity);
  };

  /**
   * Smoke in the current style (`smokeStyle`) at a canvas pixel, premultiplied. Takes
   * derivatives, so call it in uniform control flow.
   */
  const plumeColor = (pixel: d.v2i) => {
    'use gpu';
    const shape = sampleAt(puffLayout.$.plume, pixel);
    const surface = sampleAt(puffLayout.$.plumeSurface, pixel);
    const light = sampleAt(plumeLightLayout.$.plumeLight, pixel).x;
    const veil = plumeVeil(pixel);

    if (smokeStyle.$ === SMOKE_INK) {
      return inkPlume(surface, light, veil);
    }

    if (smokeStyle.$ === SMOKE_PAPER) {
      return paperPlume(shape, surface, light, veil);
    }

    return posterPlume(surface, light, veil);
  };

  /**
   * Ink style, after the user's sketch of smoke: round billows in three flat tones with ink
   * outlines. The whole cloud shares the sun's light, so crevices go dark and tops pale. A
   * billow's outline shows only where it lies on top, so billows read as heaped on each other.
   * Takes the plume's surface, light and veil at the pixel.
   */
  const inkPlume = (surface: d.v4f, light: number, veil: d.v2f) => {
    'use gpu';
    const detail = plumeDetail(veil.x);
    const steps = posterize(light, INK_DARK, INK_MIDDLE, INK_BRIGHT, INK_STEPS);
    const tone = std.mul(std.mix(PLUME_HAZE, steps, detail), surface.z);
    const glow = std.add(tone, std.mul(PLUME_HEAT, veil.y));
    const ink = edgeBand(-surface.x, INK_WIDTH) * detail;
    const alpha = veil.x * coverage(-surface.x);
    return d.vec4f(std.mul(std.mix(glow, INK_COLOR, ink), alpha), alpha);
  };

  /**
   * Poster style, after satellite photos of fires: charcoal billows with pale sunlit tops,
   * posterized into three flat tones, without outlines. Each billow catches the sun on its own,
   * bent a little toward the light of the whole cloud as one mass, and taller billows shade the
   * smoke behind them, so crevices go black.
   */
  const posterPlume = (surface: d.v4f, light: number, veil: d.v2f) => {
    'use gpu';
    const steps = posterize(light, POSTER_DARK, POSTER_MIDDLE, POSTER_BRIGHT, POSTER_STEPS);
    const tone = std.mul(std.mix(PLUME_HAZE, steps, plumeDetail(veil.x)), surface.z);
    const glow = std.add(tone, std.mul(PLUME_HEAT, veil.y));
    const alpha = veil.x * coverage(-surface.x);
    return d.vec4f(std.mul(glow, alpha), alpha);
  };

  /**
   * Paper style: smoke as sheets of flat paper cut out along the billows of each parcel, stacked
   * at the heights of their parcels. Higher sheets are paler and cast sharp shadows (`shadow`)
   * onto lower ones along the sun, as far off as they are higher; a sheet's cut edge catches the
   * sun on the side facing it and is dark on the other.
   */
  const paperPlume = (shape: d.v4f, surface: d.v4f, shadow: number, veil: d.v2f) => {
    'use gpu';
    const detail = plumeDetail(veil.x);
    const height = std.saturate((shape.x - PAPER_LOW) / (PAPER_HIGH - PAPER_LOW));
    const shade = 1 - std.smoothstep(0.35, 0.65, shadow) * PAPER_SHADOW * detail;
    const sheet = std.mul(std.mix(PLUME_HAZE, std.mix(PAPER_DARK, PAPER_PALE, height), detail), surface.z * shade);
    const edge = edgeBand(-surface.x, PAPER_EDGE) * detail;
    const cut = std.mix(std.mul(sheet, PAPER_EDGE_SHADE), PAPER_EDGE_LIT, std.smoothstep(0.1, 0.35, surface.w));
    const color = std.add(std.mix(sheet, cut, edge), std.mul(PLUME_HEAT, veil.y));
    const alpha = veil.x * coverage(-surface.x);
    return d.vec4f(std.mul(color, alpha), alpha);
  };

  /** Opacity of smoke at a canvas pixel, for light passes. */
  const plumeCover = (pixel: d.v2i) => {
    'use gpu';
    return plumeVeil(pixel).x * coverage(-sampleAt(puffLayout.$.plumeSurface, pixel).x);
  };

  /**
   * How much of a pixel keeps its own light, which point lights leave alone: fire that smoke does
   * not cover still glows, and smoke hangs high above the lights near the ground.
   */
  const keepsOwnLight = (pixel: d.v2i) => {
    'use gpu';
    const fire = coverage(-std.textureLoad(puffLayout.$.puffs, pixel, 0).z);
    const plume = plumeCover(pixel);
    return fire * (1 - plume) + plume;
  };

  /**
   * Trails, gun smoke, fire and smoke, in that order, all before point lights. Fire lies under the
   * smoke and peeks out of it; light passes leave it alone, so it still glows. Smoke goes on top,
   * since it hangs in the air, in the current style (`plumeColor`).
   */
  const smokeComposite = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
    'use gpu';
    const pixel = d.vec2i(std.floor(input.position.xy));
    const layers = std.textureLoad(puffLayout.$.puffs, pixel, 0);
    const plume = plumeColor(pixel);

    let result = over(d.vec4f(0), TRAIL_COLOR, std.saturate(layers.x));
    result = puffLayer(result, layers.w, d.vec3f(0.84), d.vec3f(0.5), 0.6, 0.9);

    const fire = std.mix(FIRE_EDGE, FIRE_CORE, std.smoothstep(1, 3.5, layers.z));
    result = puffLayer(result, layers.z, fire, FIRE_OUTLINE, 0.7, d.f32(1));
    return std.add(plume, std.mul(result, 1 - plume.w));
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
    const smokeDensity = std.textureSampleLevel(puffLayout.$.smokeShadows, puffLayout.$.smooth, canvasUv(pixel), 0).x;
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
      const style = d.u32(item.extra.y);
      let distance = d.f32(TURRET_FAR);

      for (let part = d.u32(0); part < TURRET_PARTS; part++) {
        distance = std.min(distance, turretPart(input.local, style, part, item.extra.z));
      }

      cover = coverage(distance);
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
    const plume = plumeCover(d.vec2i(std.floor(input.position.xy)));
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
  const inkTargets = { shape: { format: PLUME_FORMAT }, surface: { format: PLUME_FORMAT } } as const;
  const inkDepth = { format: PLUME_DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' } as const;
  const surfacePipelines = {
    ink: root.createRenderPipeline({ vertex: plumeVertex, fragment: inkBillowFragment, targets: inkTargets, depthStencil: inkDepth }),
    poster: root.createRenderPipeline({ vertex: plumeVertex, fragment: posterBillowFragment, targets: inkTargets, depthStencil: inkDepth }),
    paper: root.createRenderPipeline({ vertex: plumeVertex, fragment: paperSheetFragment, targets: inkTargets, depthStencil: inkDepth })
  };
  const veilPipeline = root.createRenderPipeline({
    vertex: plumeVertex,
    fragment: veilFragment,
    targets: { format: PLUME_FORMAT, blend: additive }
  });
  const plumeShadowPipeline = root.createRenderPipeline({
    vertex: plumeShadowVertex,
    fragment: plumeShadowFragment,
    targets: { format: SMOKE_SHADOW_FORMAT, blend: additive }
  });
  const plumeLightPipeline = root.createRenderPipeline({
    vertex: screenVertex,
    fragment: plumeLightFragment,
    targets: { format: PLUME_LIGHT_FORMAT }
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
  const smoothSampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });

  /**
   * Screen-sized textures: puffs merged one layer per channel, smoke plumes (two textures and a
   * depth buffer at 1 / `plumeScale` of the canvas resolution, and a veil) and the density of smoke
   * over the ground, the height map for shadows, and the light buffers (strongest ambient claim,
   * summed light given back).
   */
  function createTargets(width: number, height: number, plumeScale: number) {
    const size: [number, number] = [width, height];
    const puffs = root.createTexture({ size, format: PUFF_FORMAT }).$usage('sampled', 'render');
    const occluders = root.createTexture({ size, format: OCCLUDER_FORMAT }).$usage('sampled', 'render');
    const lightDims = root.createTexture({ size, format: LIGHT_DIM_FORMAT }).$usage('sampled', 'render');
    const lightSums = root.createTexture({ size, format: LIGHT_FORMAT }).$usage('sampled', 'render');
    const small = (divisor: number): [number, number] => [Math.ceil(width / divisor), Math.ceil(height / divisor)];
    const smokeShadows = root.createTexture({ size: small(plumeScale * SMOKE_SHADOW_SCALE), format: SMOKE_SHADOW_FORMAT }).$usage('sampled', 'render');
    const plume = root.createTexture({ size: small(plumeScale), format: PLUME_FORMAT }).$usage('sampled', 'render');
    const plumeSurface = root.createTexture({ size: small(plumeScale), format: PLUME_FORMAT }).$usage('sampled', 'render');
    const plumeVeil = root.createTexture({ size: small(plumeScale * PLUME_VEIL_SCALE), format: PLUME_FORMAT }).$usage('sampled', 'render');
    const plumeLight = root.createTexture({ size: small(plumeScale), format: PLUME_LIGHT_FORMAT }).$usage('sampled', 'render');
    const plumeDepth = device.createTexture({ size: small(plumeScale), format: PLUME_DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    return {
      width,
      height,
      plumeScale,
      textures: [puffs, occluders, lightDims, lightSums, smokeShadows, plume, plumeSurface, plumeVeil, plumeLight, plumeDepth],
      puffView: root.unwrap(puffs).createView(),
      occluderView: root.unwrap(occluders).createView(),
      lightDimView: root.unwrap(lightDims).createView(),
      lightSumView: root.unwrap(lightSums).createView(),
      smokeShadowView: root.unwrap(smokeShadows).createView(),
      plumeView: root.unwrap(plume).createView(),
      plumeSurfaceView: root.unwrap(plumeSurface).createView(),
      plumeVeilView: root.unwrap(plumeVeil).createView(),
      plumeLightView: root.unwrap(plumeLight).createView(),
      plumeLightGroup: root.createBindGroup(plumeLightLayout, { plumeLight: plumeLight.createView() }),
      plumeDepthView: plumeDepth.createView(),
      puffGroup: root.createBindGroup(puffLayout, {
        puffs: puffs.createView(),
        smokeShadows: smokeShadows.createView(),
        plume: plume.createView(),
        plumeSurface: plumeSurface.createView(),
        plumeVeil: plumeVeil.createView(),
        smooth: smoothSampler
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
  let style: SmokeStyle = SMOKE_STYLES[0];
  let time = 0;
  let nextParticle = 0;
  let spawnCount = 0;

  /**
   * Draws smoke into the plume textures: the top surface of all balls in the current style, kept
   * by a depth test, the veil of their averaged opacity and heat, and how the sun lights the surface.
   */
  function drawPlumes(encoder: GPUCommandEncoder, frame: NonNullable<typeof targets>) {
    const clear = { clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' } as const;
    // Outside all balls the surface lies far outside any rim, so it covers nothing.
    const outside = { r: FAR_OUTSIDE, g: 0, b: 0, a: 0 };
    const surfacePass = encoder.beginRenderPass({
      colorAttachments: [
        { view: frame.plumeView, ...clear },
        { view: frame.plumeSurfaceView, ...clear, clearValue: outside }
      ],
      depthStencilAttachment: { view: frame.plumeDepthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' }
    });
    drawSmokeBalls(surfacePass, surfacePipelines[style]);
    surfacePass.end();

    const veilPass = encoder.beginRenderPass({ colorAttachments: [{ view: frame.plumeVeilView, ...clear }] });
    drawSmokeBalls(veilPass, veilPipeline);
    veilPass.end();

    const lightPass = encoder.beginRenderPass({ colorAttachments: [{ view: frame.plumeLightView, ...clear }] });

    if (plumeBallCount > 0) {
      plumeLightPipeline.with(lightPass).with(frame.puffGroup).draw(3);
    }

    lightPass.end();
  }

  /** Draws this frame's balls of smoke with `pipeline`. */
  function drawSmokeBalls(pass: GPURenderPassEncoder, pipeline: { with(pass: GPURenderPassEncoder): { draw(vertices: number, instances: number): void } }) {
    if (plumeBallCount > 0) {
      pipeline.with(pass).draw(6, plumeBallCount);
    }
  }

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

    /** How smoke looks, one of `SMOKE_STYLES`; `ink` at first. */
    get smokeStyle(): SmokeStyle {
      return style;
    },

    set smokeStyle(next: SmokeStyle) {
      style = next;
      smokeStyle.write(SMOKE_STYLES.indexOf(next));
    },

    /**
     * Adds a ball of a smoke plume to this frame; balls beyond the limit are dropped. The renderer
     * shows it as the camera sees it, higher balls further from the middle of the view, and the
     * order of balls does not matter. The plume covers everything on the ground, fire included,
     * and its shadow darkens the ground like the shadow of a body.
     */
    addSmokeBall(ball: SmokeBall) {
      if (plumeBallCount >= MAX_PLUME_BALLS) {
        return;
      }

      plumeData.set(
        [ball.x, ball.y, ball.height, ball.radius, ball.opacity, ball.heat, ball.tone, ball.turn, ball.bodyHeight],
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
          body.style ?? TURRET_MEDIUM,
          body.spin ?? 0,
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

      // Plumes are drawn at about one texel per CSS pixel, which their smooth sampling keeps crisp.
      const plumeScale = Math.max(Math.round(canvasTexture.width / viewport.width), 1);

      if (targets?.width !== canvasTexture.width || targets.height !== canvasTexture.height || targets.plumeScale !== plumeScale) {
        targets?.textures.forEach((texture) => texture.destroy());
        targets = createTargets(canvasTexture.width, canvasTexture.height, plumeScale);
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

      drawPlumes(encoder, targets);

      const smokeShadowPass = encoder.beginRenderPass({
        colorAttachments: [
          { view: targets.smokeShadowView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }
        ]
      });
      drawSmokeBalls(smokeShadowPass, plumeShadowPipeline);
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
      smokePipeline.with(pass).with(targets.puffGroup).with(targets.plumeLightGroup).draw(3);

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
  /** Look of a `KIND_TURRET`: one of the `TURRET_*` constants; defaults to `TURRET_MEDIUM`. */
  style?: number;
  /** Angle in radians the barrels of a `TURRET_GATLING` have turned about their axis. */
  spin?: number;
};

/** A body shaded from its distance field, its core hidden under armor. */
export const KIND_FIELD = 0;

/** A turret, shaded from a formula in turret coordinates. */
export const KIND_TURRET = 1;

/** A plain filled rectangle, such as the floor. */
export const KIND_RECT = 2;

/** A body shaded from its distance field whose core shows through a hole. */
export const KIND_FIELD_OPEN = 3;

/** Looks of a `KIND_TURRET`: the medium tank's cupola with one barrel. */
export const TURRET_MEDIUM = 0;

/** The light tank's small cupola with two short barrels. */
export const TURRET_TWIN = 1;

/** The heavy tank's broad turret with a gatling of four barrels; `spin` turns them. */
export const TURRET_GATLING = 2;

/** A cupola with a short, fat mortar tube. */
export const TURRET_MORTAR = 3;

/** A casemate gun's fixed superstructure, drawn turned with the hull. */
export const TURRET_CASEMATE = 4;

/** A casemate gun's long barrel with its mantlet and muzzle brake. */
export const TURRET_LONG_GUN = 5;

/**
 * Quads that hold each turret look with room for its outline, in turret coordinates, to spread
 * into a `KIND_TURRET` body: the quad starts half a cell before `originX`, `originY`.
 */
export const TURRET_QUADS: Record<number, Pick<BodyDraw, 'originX' | 'originY' | 'cell' | 'cols' | 'rows'>> = {
  [TURRET_MEDIUM]: { originX: -10.5, originY: -10.5, cell: 1, cols: 42, rows: 22 },
  [TURRET_TWIN]: { originX: -8.5, originY: -8.5, cell: 1, cols: 33, rows: 18 },
  [TURRET_GATLING]: { originX: -14.5, originY: -12.5, cell: 1, cols: 50, rows: 26 },
  [TURRET_MORTAR]: { originX: -10.5, originY: -10.5, cell: 1, cols: 35, rows: 22 },
  [TURRET_CASEMATE]: { originX: -10.5, originY: -11.5, cell: 1, cols: 28, rows: 24 },
  [TURRET_LONG_GUN]: { originX: 3.5, originY: -6.5, cell: 1, cols: 49, rows: 14 }
};

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

/** A puff of fire. Merges with other fire into one outlined shape, drawn under smoke. */
export const PARTICLE_FIRE = 5;

/**
 * Styles of smoke: `ink`, round billows in flat tones with ink outlines, after the user's sketch;
 * `poster`, charcoal billows with pale sunlit tops in flat tones and no outlines, after satellite
 * photos of fires; `paper`, sheets of flat paper cut out along each parcel's billows and stacked
 * up toward the camera, casting shadows on each other.
 */
export const SMOKE_STYLES = ['ink', 'poster', 'paper'] as const;

export type SmokeStyle = (typeof SMOKE_STYLES)[number];


/** Field cells per slot: enough for a 0.5 px hull or a 1 px crate. */
export const SLOT_CELLS = 96 * 64;

const FIELD_SLOTS = 256;
const MAX_BODIES = 1024;
const MAX_PARTICLES = 65536;
const MAX_SPAWNS_PER_FRAME = 4096;
const OUTLINE = 1;
/** Parts a turret look may have, and the distance of the parts it lacks. */
const TURRET_PARTS = 4;
const TURRET_FAR = 1000;
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
/** Fire: deep orange at its edge, yellow inside, with a dark red outline. */
const FIRE_EDGE = d.vec3f(1, 0.36, 0.08);
const FIRE_CORE = d.vec3f(1, 0.85, 0.45);
const FIRE_OUTLINE = d.vec3f(0.4, 0.06, 0.02);
/** Distance written where there is no puff; must stay within half-float range. */
const FAR_OUTSIDE = -1000;
const puffLayout = tgpu.bindGroupLayout({
  puffs: { texture: d.texture2d(d.f32) },
  smokeShadows: { texture: d.texture2d(d.f32) },
  plume: { texture: d.texture2d(d.f32) },
  plumeSurface: { texture: d.texture2d(d.f32) },
  plumeVeil: { texture: d.texture2d(d.f32) },
  smooth: { sampler: 'filtering' }
});
/** Density of plume smoke over the ground, summed over the balls' shadows, at 1 / `SMOKE_SHADOW_SCALE` of the plume resolution. */
const SMOKE_SHADOW_FORMAT = 'r16float';
const SMOKE_SHADOW_SCALE = 4;
/** The veil of smoke, smooth by design, is drawn at 1 / `PLUME_VEIL_SCALE` of the plume resolution. */
const PLUME_VEIL_SCALE = 2;
/** Opacity of a smoke shadow per unit of density. */
const SMOKE_SHADOW_DENSITY = 3;
/** Plume textures; what their channels hold depends on the smoke style. */
const PLUME_FORMAT = 'rgba16float';
/** How the sun lights the plume, in its own texture since the plume textures are read while it is drawn. */
const PLUME_LIGHT_FORMAT = 'r16float';
const plumeLightLayout = tgpu.bindGroupLayout({ plumeLight: { texture: d.texture2d(d.f32) } });
/** Height above the ground the camera looks down from, in world pixels: sets the strength of parallax. */
export const CAMERA_HEIGHT = 600;
/** Unit vector toward the sun in world axes, with z up: shadows fall `SUN.shadowLength` per unit of height. */
const SUN_TOWARD = std.normalize(d.vec3f(-SUN.direction.x, -SUN.direction.y, 1 / SUN.shadowLength));
/** How far a ball's rim bulges in and out, as a share of its radius. */
const PLUME_LUMPS = 0.14;
/** Shadows of balls on the ground fall off over this outer fraction of their radius. */
const PLUME_SHADOW_SOFTNESS = 0.6;
/** Steps and reach, in world pixels, of the walk toward the sun over the plume's own heights. */
const PLUME_SHADOW_STEPS = 24;
const PLUME_SHADOW_REACH = 30;
/** Glow added to smoke right above the flames. */
const PLUME_HEAT = d.vec3f(0.42, 0.14, 0.03);

/** Index of styles of `SMOKE_STYLES` in the shaders. */
const SMOKE_INK = 0;
const SMOKE_POSTER = 1;
const SMOKE_PAPER = 2;
/** Ink style: billows are domes this flat, as a share of their radius; light sees them as round as `INK_ROUNDNESS`. */
const INK_DOME = 0.65;
const INK_ROUNDNESS = 1.4;
/** World pixels of height by which dense smoke stays on top of thinner smoke. */
const PLUME_DENSE_LEAD = 40;
/** Opacity below which smoke shows one flat tone, `PLUME_HAZE`; it shows full light and shade at opacity 1. */
const PLUME_FLAT_BELOW = 0.5;
const PLUME_HAZE = d.vec3f(0.3, 0.29, 0.28);
/** Depth buffer of the ink and poster styles and the height it spans, in world pixels: higher surfaces win. */
const PLUME_DEPTH_FORMAT = 'depth24plus';
const PLUME_DEPTH_RANGE = 2000;
/** Ink style tones: away from the sun or shaded, half lit, fully lit; light (0-1) steps up at `INK_STEPS`. */
const INK_DARK = d.vec3f(0.12, 0.12, 0.13);
const INK_MIDDLE = d.vec3f(0.22, 0.22, 0.23);
const INK_BRIGHT = d.vec3f(0.38, 0.37, 0.36);
const INK_STEPS = d.vec2f(0.3, 0.72);
/** Ink outline: width in world pixels, and color. */
const INK_WIDTH = 0.8;
const INK_COLOR = d.vec3f(0.02);
/**
 * Poster style: how far noise warps a billow and how tall its dome is, as shares of its radius;
 * tones and steps as in the ink style.
 */
const POSTER_WARP = 0.04;
const POSTER_DOME = 0.8;
const POSTER_DARK = d.vec3f(0.05, 0.05, 0.055);
const POSTER_MIDDLE = d.vec3f(0.13, 0.13, 0.135);
const POSTER_BRIGHT = d.vec3f(0.42, 0.41, 0.39);
const POSTER_STEPS = d.vec2f(0.4, 0.82);
/**
 * Poster light: world pixels of the cloud's mound per unit of summed veil weight, how much the
 * billows bend its normal (0-1) and how deeply taller billows shade the smoke behind them (0-1).
 */
const POSTER_RELIEF = 4;
const POSTER_BILLOWS = 0.85;
const POSTER_SHADE = 0.8;
/** Farthest a ball reaches from its center, as a share of its radius: lumps and warp included. */
const PLUME_REACH = 1 + PLUME_LUMPS + POSTER_WARP / 2;
/** World pixels past a ball's rim over which the plume textures keep its distance to the rim. */
const PLUME_EDGE_BAND = 2;
/**
 * Paper style: sheets are tinted from `PAPER_DARK` at `PAPER_LOW` world pixels up to `PAPER_PALE`
 * at `PAPER_HIGH`; their cut edge is `PAPER_EDGE` world pixels wide, `PAPER_EDGE_LIT` facing the
 * sun and `PAPER_EDGE_SHADE` as bright as the sheet elsewhere. Within `PAPER_MERGE` world pixels
 * of height per world pixel inside, sheets merge.
 */
const PAPER_DARK = d.vec3f(0.07, 0.07, 0.08);
const PAPER_PALE = d.vec3f(0.3, 0.29, 0.28);
const PAPER_LOW = 30;
const PAPER_HIGH = 150;
const PAPER_EDGE = 0.7;
const PAPER_EDGE_SHADE = 0.4;
const PAPER_EDGE_LIT = d.vec3f(0.55, 0.53, 0.5);
const PAPER_MERGE = 0.01;
/** Paper shadows: steps of the walk toward the sun and their length in world pixels, softness and darkening. */
const PAPER_SHADOW_STEPS = 16;
const PAPER_SHADOW_STEP = 2;
const PAPER_SHADOW_SOFTNESS = 1.5;
const PAPER_SHADOW = 0.6;

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

/** A ball of a smoke plume, where it is rather than where the camera sees it. Lengths are in world pixels. */
export type SmokeBall = {
  /** Point on the ground under its center. */
  x: number;
  y: number;
  /** Height of its center above the ground. */
  height: number;
  radius: number;
  /** Opacity, 0-1. Thinning smoke flattens into one translucent tone in every style. */
  opacity: number;
  /** How strongly the flames below light the ball, 0-1. */
  heat: number;
  /** Brightness of its smoke, about 1; also picks the lumps of its rim, so give neighbours different tones. */
  tone: number;
  /** Angle in radians that turns the lumps of its rim; change it slowly to roll the ball. */
  turn: number;
  /**
   * Height of the parcel of smoke the ball belongs to, at or below `height`; the paper style lays
   * every ball of a parcel flat at that height, so a parcel is one sheet.
   */
  bodyHeight: number;
};

/**
 * A ball of a smoke plume: `place` = ground point, height, radius; `look` = opacity, heat, tone,
 * turn; `bodyHeight` as in `SmokeBall`.
 */
const PlumeBall = d.struct({
  place: d.vec4f,
  look: d.vec4f,
  bodyHeight: d.f32
});
const PLUME_BALL_FLOATS = 12;
const MAX_PLUME_BALLS = 8192;

/** `shape` = position, radius, intensity; `color` = RGB and the light's height. */
const Light = d.struct({
  shape: d.vec4f,
  color: d.vec4f
});
const LIGHT_FLOATS = 8;

/**
 * What every style needs to shade a ball of smoke, passed from the vertex to the fragment stage:
 * `offset` from where the camera sees its center, in world pixels and axes; `ball` = height, seen
 * radius, true radius; `look` as in `PlumeBall`; `rim` = phases of its rim (`rimPhases`).
 */
const PLUME_FRAGMENT_IN = {
  offset: d.vec2f,
  ball: d.interpolate('flat', d.vec3f),
  look: d.interpolate('flat', d.vec4f),
  rim: d.interpolate('flat', d.vec4f)
};
const PLUME_VARYING = { position: d.builtin.position, ...PLUME_FRAGMENT_IN };

/** What the shadow of a ball of smoke needs: `offset` from its center, its true `radius`, `look` and `rim` as in `PLUME_FRAGMENT_IN`. */
const SHADOW_FRAGMENT_IN = {
  offset: d.vec2f,
  radius: d.interpolate('flat', d.f32),
  look: d.interpolate('flat', d.vec4f),
  rim: d.interpolate('flat', d.vec4f)
};
const SHADOW_VARYING = { position: d.builtin.position, ...SHADOW_FRAGMENT_IN };

