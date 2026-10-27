import { createPlumes, type FireRecord, type SootRecord } from '../damage/burning';
import type { DamageField } from '../damage/field';
import type { BodyDraw, createRangeRenderer } from '../damage/renderer';
import type { HudState } from './Hud';
import type { KothMatch } from './match';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Records what a match draws, as data, into a tape that shows any moment of it again at once
 * (see `createTapePlayer`): for kill-cams, a match's best moments and seeking a replay.
 *
 * `renderer` stands in for `target`, the renderer the match draws on: hand it to the match. It
 * passes every call on, unless muted, and keeps what the tape needs. Call `endFrame` after the
 * match drew a frame (`KothMatch['draw']`), with the step it shows.
 *
 * The tape keeps data rather than pictures. Of the bodies drawn, only what changed since the frame
 * before, with the whole list every `KEY_EVERY` frames; of the damage fields, the cells a hit
 * changed, with whole fields only where they are new; of the smoke, the fires and puffs of soot as
 * they began (see `createBurning`), which draw the smoke again at any moment; and the lights and
 * particles as they are, the members' positions and, every `HUD_EVERY` steps, the heads-up
 * display. A five-minute match takes a few tens of megabytes.
 *
 * Muted, the recorder passes nothing on but allocating and freeing field slots: the match goes
 * on and is recorded while a tape player draws on `target`, as during a kill-cam. `resume`
 * passes calls on again and puts back every field the match has, which the player overwrote.
 */
export function createTapeRecorder(target: Renderer) {
  const tape = createTape();
  /** Each field slot's content as last uploaded, and as the tape has it, with the frame it was kept at. */
  const current = new Map<number, DamageField>();
  const kept = new Map<number, { field: DamageField; frame: number }>();
  const changed = new Set<number>();
  let packed = new Float32Array(1024 * BODY);
  let bodyCount = 0;
  const lights: number[] = [];
  const spawns: number[] = [];
  let muted = false;

  const overrides: Partial<Renderer> = {
    beginBodies() {
      bodyCount = 0;
      lights.length = 0;

      if (!muted) {
        target.beginBodies();
      }
    },

    addBody(body: BodyDraw) {
      if (bodyCount * BODY >= packed.length) {
        const grown = new Float32Array(packed.length * 2);
        grown.set(packed);
        packed = grown;
      }

      pack(body, packed, bodyCount++ * BODY);

      if (!muted) {
        target.addBody(body);
      }
    },

    addSmokeBall(ball) {
      // Smoke is drawn again from its fires and soot, not kept ball by ball.
      if (!muted) {
        target.addSmokeBall(ball);
      }
    },

    addLight(x, y, radius, intensity, color, height) {
      lights.push(x, y, radius, intensity, color[0], color[1], color[2], height);

      if (!muted) {
        target.addLight(x, y, radius, intensity, color, height);
      }
    },

    spawn(kind, x, y, vx, vy, life, size, color) {
      spawns.push(kind, x, y, vx, vy, life, size, color[0], color[1], color[2], color[3]);

      if (!muted) {
        target.spawn(kind, x, y, vx, vy, life, size, color);
      }
    },

    uploadField(slot, field) {
      current.set(slot, { ...field, data: field.data.slice() });
      changed.add(slot);

      if (!muted) {
        target.uploadField(slot, field);
      }
    }
  };

  const renderer = new Proxy(target, {
    get: (object, key) => (key in overrides ? overrides[key as keyof Renderer] : Reflect.get(object, key))
  });

  return {
    renderer,
    tape,

    /**
     * Keeps the frame the match just drew as the picture of step `step`, the steps played; a
     * later frame of the same step is left out, and the particles of both go with the next one.
     */
    endFrame(step: number, match: KothMatch) {
      if (tape.end !== undefined && step <= tape.end) {
        return;
      }

      keepFields();
      tape.frame(step, packed.subarray(0, bodyCount * BODY), lights, spawns, match);
      spawns.length = 0;
    },

    /** The field slots whose latest change the tape keeps only with a later frame (see `keepFields`); read only. */
    lagging: changed as ReadonlySet<number>,

    /** Stops passing the match's drawing on to `target`, while something else draws there. */
    mute() {
      muted = true;
    },

    /** Passes the match's drawing on again and uploads every field it has, as it has them now. */
    resume() {
      muted = false;

      for (const [slot, field] of current) {
        target.uploadField(slot, field);
      }
    }
  };

  /**
   * Keeps on the tape the fields uploaded since the last frame, each as it is now: a new field
   * whole, and the cells a hit changed at once. A change to most of a field, as mending makes
   * step after step, is kept at most every `WIDE_EVERY` frames, which is smooth enough for the
   * slow change it is and spares the tape a whole field a step.
   */
  function keepFields() {
    const frame = tape.frames.length;

    for (const slot of changed) {
      const now = current.get(slot)!;
      const was = kept.get(slot);
      const diff = was && was.field.cols === now.cols && was.field.rows === now.rows ? diffOf(was.field.data, now.data, now.cols, now.rows) : undefined;

      if (diff === null) {
        changed.delete(slot);
        continue;
      }

      if (was && (!diff || diff.values.length > NARROW) && frame - was.frame < WIDE_EVERY) {
        continue;
      }

      tape.upload(slot, now, diff);
      kept.set(slot, { field: now, frame });
      changed.delete(slot);
    }
  }
}

/** Numbers of a field change kept at once, however soon after the last; a wider change waits `WIDE_EVERY` frames from it. */
const NARROW = 4096;
const WIDE_EVERY = 60;

/** A tape of `createTapeRecorder`. */
export type Tape = ReturnType<typeof createTape>;

/**
 * Shows a tape's moments on `target`: `show` queues everything drawn at a step, in fractions of a
 * step too, for slow motion, by moving bodies and members between the frames around it. Damage
 * fields are put back as they were at that step, by applying the hits since the step shown last,
 * or rebuilding the fields they hit when going back. Particles are spawned as the frames shown
 * follow on from one another, as when playing, and age by the time the playhead moved, so they
 * hold still while it does; a jump, back or far ahead, puts back those of the
 * `PARTICLE_HISTORY` s before it, spawned and aged on `target` as when played.
 */
export function createTapePlayer(target: Renderer, tape: Tape) {
  const plumes = createPlumes();
  const fields = new Map<number, { field: DamageField; data: Float32Array }>();
  const dirty = new Set<number>();
  let applied = 0;
  let shownIndex: number | undefined;
  let shownTime = 0;

  return {
    /**
     * Queues the frame at `time`, in steps, on `target` after its `beginBodies`, and uploads the
     * fields as they were then; the caller renders. Returns where each member was, in the match's
     * order, `undefined` while it waited to respawn, the heads-up display and `age`, the seconds
     * the caller's `render` advances particles by, or `undefined` when the tape has no frame at or
     * before `time`.
     */
    show(time: number) {
      const index = tape.indexAt(time);

      if (index === undefined) {
        return undefined;
      }

      const frame = tape.frames[index];
      const next = tape.frames[index + 1];
      const share = next && next.step - frame.step <= MAX_GAP ? Math.min(Math.max((time - frame.step) / (next.step - frame.step), 0), 1) : 0;
      const bodies = tape.bodiesAt(index);
      const after = share > 0 ? tape.bodiesAt(index + 1) : undefined;

      fieldsTo(frame.uploads);
      target.beginBodies();

      for (let offset = 0; offset < bodies.length; offset += BODY) {
        target.addBody(unpack(bodies, offset, after, share));
      }

      for (let offset = 0; offset < frame.lights.length; offset += 8) {
        const light = frame.lights;
        target.addLight(light[offset], light[offset + 1], light[offset + 2], light[offset + 3], [light[offset + 4], light[offset + 5], light[offset + 6]], light[offset + 7]);
      }

      const smokeTime = frame.smokeTime + (next && share > 0 ? (next.smokeTime - frame.smokeTime) * share : 0);
      plumes.draw(target, tape.firesAt(smokeTime), tape.sootAt(smokeTime), smokeTime);

      // Particles of the frames passed since the last one shown, when playing on; after a jump,
      // those on screen belong to another moment, and that moment's own are put back.
      const followsOn = shownIndex !== undefined && index >= shownIndex && index - shownIndex <= MAX_SPAWN_RUN && time >= shownTime;
      let age = (time - shownTime) / 60;

      if (followsOn) {
        for (let passed = shownIndex! + 1; passed <= index; passed++) {
          spawnOf(passed);
        }
      } else {
        target.clearParticles();
        const first = tape.indexAt(frame.step - PARTICLE_HISTORY * 60) ?? 0;

        // As when played, a frame's particles age from the frame before it on.
        for (let passed = first; passed < index; passed++) {
          spawnOf(passed);
          target.advanceParticles((tape.frames[passed].step - stepBefore(passed)) / 60);
        }

        spawnOf(index);
        age = (time - stepBefore(index)) / 60;
      }

      shownIndex = index;
      shownTime = time;

      return {
        step: frame.step,
        members: tape.members.map((_, member) => positionOf(frame, next, share, member)),
        hud: tape.hudAt(index),
        age
      };
    }
  };

  /** The step of the frame before frame `index`, or the step before its own for the first. */
  function stepBefore(index: number) {
    return tape.frames[index - 1]?.step ?? tape.frames[index].step - 1;
  }

  /** Spawns on `target` the particles frame `index` spawned. */
  function spawnOf(index: number) {
    const spawns = tape.frames[index].spawns;

    for (let offset = 0; offset < spawns.length; offset += 11) {
      target.spawn(spawns[offset], spawns[offset + 1], spawns[offset + 2], spawns[offset + 3], spawns[offset + 4], spawns[offset + 5], spawns[offset + 6], [spawns[offset + 7], spawns[offset + 8], spawns[offset + 9], spawns[offset + 10]]);
    }
  }

  /** Brings the fields to the uploads before `count` and uploads the slots that changed. */
  function fieldsTo(count: number) {
    if (count >= applied) {
      for (; applied < count; applied++) {
        apply(applied);
      }
    } else {
      const hit = new Set<number>();

      for (let index = count; index < applied; index++) {
        hit.add(tape.uploads[index].slot);
      }

      applied = count;

      for (const slot of hit) {
        rebuild(slot, count);
      }
    }

    for (const slot of dirty) {
      const kept = fields.get(slot);

      if (kept) {
        target.uploadField(slot, kept.field);
      }
    }

    dirty.clear();
  }

  function apply(index: number) {
    const upload = tape.uploads[index];

    if (upload.full) {
      const data = new Float32Array(upload.full.data.length);
      dequantize(upload.full.data, data);
      fields.set(upload.slot, { field: { ...upload.full, data }, data });
    } else if (upload.diff) {
      const kept = fields.get(upload.slot);

      if (kept) {
        writeDiff(kept.data, kept.field.cols, upload.diff);
      }
    }

    dirty.add(upload.slot);
  }

  /** Builds `slot` anew from its uploads before `count`: its last whole field and the hits after it. */
  function rebuild(slot: number, count: number) {
    const history = tape.uploadsOf(slot);
    let from = -1;

    for (let position = 0; position < history.length && history[position] < count; position++) {
      if (tape.uploads[history[position]].full) {
        from = position;
      }
    }

    if (from < 0) {
      fields.delete(slot);
      return;
    }

    for (let position = from; position < history.length && history[position] < count; position++) {
      apply(history[position]);
    }
  }
}

/** Steps a frame may lie from the next for the bodies between them to move smoothly; past it they keep still. */
const MAX_GAP = 6;
/** Frames passed at once whose particles are still spawned, as when playing fast. */
const MAX_SPAWN_RUN = 30;
/** Seconds before a moment jumped to whose particles are put back: the longest any lives, a shot's trail. */
const PARTICLE_HISTORY = 2;

/** The tape's data and the means to write and read it; see `createTapeRecorder`. */
function createTape() {
  const frames: TapeFrame[] = [];
  const uploads: Upload[] = [];
  const bySlot = new Map<number, number[]>();
  const wholes = new Map<number, Int16Array[]>();
  const fires: FireRecord[] = [];
  const soot: SootRecord[] = [];
  const huds: { index: number; hud: HudState }[] = [];
  let members: { id: number }[] = [];
  let lastSmoke = -1;
  let longestSoot = 0;
  let previous = new Float32Array(0);
  let cache: { index: number; bodies: Float32Array }[] = [];
  const sizes = { keys: 0, deltas: 0, wholes: 0, diffs: 0, lights: 0, spawns: 0, members: 0, frames: 0, uploads: 0 };

  return {
    frames: frames as readonly TapeFrame[],
    uploads: uploads as readonly Upload[],

    /** The members, in the match's order, whose positions every frame keeps. */
    get members() {
      return members as readonly { id: number }[];
    },

    /** The first and the last step with a frame, while the tape has any. */
    get start() {
      return frames[0]?.step;
    },

    get end() {
      return frames.at(-1)?.step;
    },

    /** About how many bytes the tape takes. */
    get bytes() {
      return Object.values(sizes).reduce((total, size) => total + size, 0);
    },

    /** The bytes of `bytes` by what they keep. */
    sizes: sizes as Readonly<typeof sizes>,

    /** Keeps `field` as the content of `slot` from the next frame on: by `diff`, the cells changed since it was kept last, or whole. */
    upload(slot: number, field: DamageField, diff: FieldDiff | undefined) {
      const index = uploads.length;
      const upload: Upload = diff ? { slot, diff } : { slot, full: { ...field, data: whole(field.data) } };
      uploads.push(upload);
      sizes.uploads += 32;
      sizes.diffs += upload.diff?.values.byteLength ?? 0;
      let history = bySlot.get(slot);

      if (!history) {
        history = [];
        bySlot.set(slot, history);
      }

      history.push(index);
    },

    /** Keeps a frame of step `step`: its bodies packed as `pack` packs them, its lights, the particles spawned since the last frame and the match's smoke, members and display. */
    frame(step: number, bodies: Float32Array, lights: readonly number[], spawns: readonly number[], match: KothMatch) {
      const index = frames.length;
      const key = index % KEY_EVERY === 0;
      const smoke = match.combat.burning;

      if (index === 0) {
        members = match.members.map((member) => ({ id: member.id }));
      }

      // Records are numbered as they begin, so the new ones, in number order, also go in order of start.
      const begun = [...smoke.fires, ...smoke.soot].filter((record) => record.id > lastSmoke).sort((a, b) => a.id - b.id);

      for (const record of begun) {
        if ('spread' in record) {
          fires.push(record);
        } else {
          soot.push(record);
          longestSoot = Math.max(longestSoot, record.life);
        }

        lastSmoke = record.id;
      }

      const positions = new Float32Array(members.length * 2).fill(Number.NaN);
      match.members.forEach((member, slot) => {
        const at = member.tank?.hull.translation();

        if (at) {
          positions[slot * 2] = at.x;
          positions[slot * 2 + 1] = at.y;
        }
      });

      const frame: TapeFrame = {
        step,
        key: key ? bodies.slice() : undefined,
        delta: key ? undefined : deltaOf(previous, bodies),
        lights: Float32Array.from(lights),
        spawns: Float32Array.from(spawns),
        smokeTime: smoke.time,
        members: positions,
        uploads: uploads.length
      };
      frames.push(frame);
      previous = bodies.slice();
      sizes.keys += frame.key?.byteLength ?? 0;
      sizes.deltas += frame.delta ? frame.delta.values.byteLength + frame.delta.indices.byteLength * 3 : 0;
      sizes.lights += frame.lights.byteLength;
      sizes.spawns += frame.spawns.byteLength;
      sizes.members += positions.byteLength;
      sizes.frames += 96;

      if (huds.length === 0 || step - frames[huds.at(-1)!.index].step >= HUD_EVERY) {
        huds.push({ index, hud: match.hud() });
      }
    },

    /** The index of the last frame at or before `time`, in steps, if any. */
    indexAt(time: number) {
      let low = 0;
      let high = frames.length - 1;

      if (high < 0 || frames[0].step > time) {
        return undefined;
      }

      while (low < high) {
        const middle = (low + high + 1) >> 1;

        if (frames[middle].step <= time) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }

      return low;
    },

    /** The bodies of frame `index`, packed; the last two asked for are kept, for frames shown in turn. */
    bodiesAt(index: number) {
      const cached = cache.find((entry) => entry.index === index);

      if (cached) {
        return cached.bodies;
      }

      const keyIndex = index - (index % KEY_EVERY);
      const start = cache.filter((entry) => entry.index >= keyIndex && entry.index < index).sort((a, b) => b.index - a.index)[0];
      let bodies = start ? start.bodies : frames[keyIndex].key!;

      for (let at = (start ? start.index : keyIndex) + 1; at <= index; at++) {
        bodies = applyDelta(bodies, frames[at].delta!);
      }

      cache = [{ index, bodies }, ...cache].slice(0, 2);
      return bodies;
    },

    /** The heads-up display last kept at or before frame `index`. */
    hudAt(index: number) {
      let low = 0;
      let high = huds.length - 1;

      while (low < high) {
        const middle = (low + high + 1) >> 1;

        if (huds[middle].index <= index) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }

      return huds[low]?.hud;
    },

    /** The uploads into `slot`, by index, oldest first. */
    uploadsOf(slot: number) {
      return bySlot.get(slot) ?? [];
    },

    /**
     * The fires begun before `time` on the burning's clock; those gone draw nothing. A record
     * begun at a frame's very time came with the step after it, so it is left out.
     */
    firesAt(time: number) {
      return fires.filter((fire) => fire.start < time);
    },

    /** The puffs of soot in the air at `time` on the burning's clock, begun before it, as `firesAt`. */
    sootAt(time: number) {
      let low = 0;
      let high = soot.length;

      while (low < high) {
        const middle = (low + high) >> 1;

        if (soot[middle].start < time - longestSoot) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      const alive: SootRecord[] = [];

      for (let index = low; index < soot.length && soot[index].start < time; index++) {
        if (time - soot[index].start < soot[index].life) {
          alive.push(soot[index]);
        }
      }

      return alive;
    }
  };

  /** `data` as kept for a whole field, in 16 bits: one copy for every field of the same content, as identical walls of a map are at first. */
  function whole(data: Float32Array) {
    const kept = quantize(data);
    const hash = hashOf(kept);
    const same = wholes.get(hash)?.find((other) => other.length === kept.length && other.every((value, index) => value === kept[index]));

    if (same) {
      return same;
    }

    wholes.set(hash, [...(wholes.get(hash) ?? []), kept]);
    sizes.wholes += kept.byteLength;
    return kept;
  }
}

/**
 * A frame of a tape: its step; its bodies, whole on a key frame and otherwise as they changed from
 * the frame before; the lights, as `addLight` takes them, 8 numbers each; the particles spawned
 * since the frame before, as `spawn` takes them, 11 numbers each; the burning's clock; the members'
 * positions, x and y each, NaN while it waits to respawn; and how many uploads the fields had.
 */
type TapeFrame = {
  step: number;
  key: Float32Array | undefined;
  delta: Delta | undefined;
  lights: Float32Array;
  spawns: Float32Array;
  smokeTime: number;
  members: Float32Array;
  uploads: number;
};

/** A field kept as `ROUNDED`: its size and place, and its numbers in 16 bits. */
type KeptField = Omit<DamageField, 'data'> & { data: Int16Array };

/** An upload of a field into a slot: a whole new field, or the cells a hit changed. */
type Upload = { slot: number; full?: KeptField; diff?: FieldDiff };

/** The cells in rows `top` to `bottom` and columns `left` to `right` of a field, all channels, row by row, in 16 bits as `ROUNDED`. */
type FieldDiff = { top: number; bottom: number; left: number; right: number; values: Int16Array };

/** Bodies that changed from one frame to the next: how many there are now, and for each changed one its index, which of its numbers changed and their values. */
type Delta = { count: number; indices: Uint16Array; masks: Uint32Array; values: Float32Array };

/** Numbers a body is packed into: kind, x, y, angle, origin x and y, cell, columns, rows, slot, red, green, blue, flash, alpha, height, style, spin, margin. */
const BODY = 19;

/** Frames between two whole lists of bodies. */
const KEY_EVERY = 120;

/** Steps between two heads-up displays kept. */
const HUD_EVERY = 6;

function pack(body: BodyDraw, into: Float32Array, offset: number) {
  into[offset] = body.kind;
  into[offset + 1] = body.x;
  into[offset + 2] = body.y;
  into[offset + 3] = body.angle;
  into[offset + 4] = body.originX;
  into[offset + 5] = body.originY;
  into[offset + 6] = body.cell;
  into[offset + 7] = body.cols;
  into[offset + 8] = body.rows;
  into[offset + 9] = body.slot ?? Number.NaN;
  into[offset + 10] = body.color[0];
  into[offset + 11] = body.color[1];
  into[offset + 12] = body.color[2];
  into[offset + 13] = body.flash ?? Number.NaN;
  into[offset + 14] = body.alpha ?? Number.NaN;
  into[offset + 15] = body.height ?? Number.NaN;
  into[offset + 16] = body.style ?? Number.NaN;
  into[offset + 17] = body.spin ?? Number.NaN;
  into[offset + 18] = body.margin ?? Number.NaN;
}

/**
 * The body packed at `offset` of `bodies`, moved a `share` of the way to the same body in `after`
 * when it is there, of the same kind, field and size, at the same place in the list.
 */
function unpack(bodies: Float32Array, offset: number, after: Float32Array | undefined, share: number): BodyDraw {
  const optional = (index: number) => (Number.isNaN(bodies[offset + index]) ? undefined : bodies[offset + index]);
  let x = bodies[offset + 1];
  let y = bodies[offset + 2];
  let angle = bodies[offset + 3];

  if (after && offset + BODY <= after.length && [0, 4, 5, 7, 8, 9].every((index) => Object.is(after[offset + index], bodies[offset + index]))) {
    x += (after[offset + 1] - x) * share;
    y += (after[offset + 2] - y) * share;
    angle += Math.atan2(Math.sin(after[offset + 3] - angle), Math.cos(after[offset + 3] - angle)) * share;
  }

  return {
    kind: bodies[offset],
    x,
    y,
    angle,
    originX: bodies[offset + 4],
    originY: bodies[offset + 5],
    cell: bodies[offset + 6],
    cols: bodies[offset + 7],
    rows: bodies[offset + 8],
    slot: optional(9),
    color: [bodies[offset + 10], bodies[offset + 11], bodies[offset + 12]],
    flash: optional(13),
    alpha: optional(14),
    height: optional(15),
    style: optional(16),
    spin: optional(17),
    margin: optional(18)
  };
}

/** Where member `member` was between `frame` and `next`, a `share` of the way, or `undefined` while it waited to respawn. */
function positionOf(frame: TapeFrame, next: TapeFrame | undefined, share: number, member: number) {
  const x = frame.members[member * 2];
  const y = frame.members[member * 2 + 1];

  if (Number.isNaN(x)) {
    return undefined;
  }

  const nextX = next?.members[member * 2] ?? Number.NaN;

  if (share === 0 || Number.isNaN(nextX)) {
    return { x, y };
  }

  return { x: x + (nextX - x) * share, y: y + (next!.members[member * 2 + 1] - y) * share };
}

function deltaOf(before: Float32Array, now: Float32Array): Delta {
  const indices: number[] = [];
  const masks: number[] = [];
  const values: number[] = [];

  for (let body = 0; body * BODY < now.length; body++) {
    const offset = body * BODY;
    let mask = 0;

    for (let field = 0; field < BODY; field++) {
      if (offset + BODY > before.length || !Object.is(before[offset + field], now[offset + field])) {
        mask |= 1 << field;
        values.push(now[offset + field]);
      }
    }

    if (mask !== 0) {
      indices.push(body);
      masks.push(mask);
    }
  }

  return { count: now.length / BODY, indices: Uint16Array.from(indices), masks: Uint32Array.from(masks), values: Float32Array.from(values) };
}

function applyDelta(before: Float32Array, delta: Delta) {
  const now = new Float32Array(delta.count * BODY);
  now.set(before.subarray(0, Math.min(before.length, now.length)));
  let value = 0;

  for (let entry = 0; entry < delta.indices.length; entry++) {
    const offset = delta.indices[entry] * BODY;
    const mask = delta.masks[entry];

    for (let field = 0; field < BODY; field++) {
      if (mask & (1 << field)) {
        now[offset + field] = delta.values[value++];
      }
    }
  }

  return now;
}

/**
 * The cells of a field of `cols` by `rows` cells that changed from `before` to `now`, within their bounding
 * box; `null` when none did, `undefined` when the box would take more than half the field, which
 * is then kept whole.
 */
function diffOf(before: Float32Array, now: Float32Array, cols: number, rows: number): FieldDiff | null | undefined {
  const perCell = now.length / (cols * rows);
  let top = Infinity;
  let bottom = -1;
  let left = Infinity;
  let right = -1;

  for (let index = 0; index < now.length; index++) {
    if (!Object.is(before[index], now[index])) {
      const cell = Math.floor(index / perCell);
      const row = Math.floor(cell / cols);
      const column = cell % cols;
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
      left = Math.min(left, column);
      right = Math.max(right, column);
    }
  }

  if (bottom < 0) {
    return null;
  }

  const width = right - left + 1;
  const height = bottom - top + 1;

  if (width * height * perCell * 2 > now.length) {
    return undefined;
  }

  const values = new Int16Array(width * height * perCell);

  for (let row = 0; row < height; row++) {
    const from = ((top + row) * cols + left) * perCell;
    values.set(quantize(now.subarray(from, from + width * perCell)), row * width * perCell);
  }

  return { top, bottom, left, right, values };
}

/**
 * How the tape keeps a field's numbers, in 16 bits: the distances of channels 0-2 to 1/32 px
 * within ±1023 px, beyond which a cell is simply far and comes back as `FAR`, and the soot of
 * channel 3 to 1/32000. Far finer than a pixel of the screen at the closest zoom.
 */
export const ROUNDED = { distance: 32, scorch: 32000, far: 32767, FAR: 10000 };

/** `values`, a run of whole cells of a field's four channels (see `CHANNELS`), in 16 bits as `ROUNDED`. */
function quantize(values: Float32Array) {
  const out = new Int16Array(values.length);

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    out[index] =
      (index & 3) === 3
        ? Math.round(Math.min(Math.max(value, -1), 1) * ROUNDED.scorch)
        : Math.round(Math.min(Math.max(value * ROUNDED.distance, -ROUNDED.far), ROUNDED.far));
  }

  return out;
}

/** The numbers `quantize` kept, back as floats, into `out` from `offset`. */
function dequantize(values: Int16Array, out: Float32Array, offset = 0) {
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    out[offset + index] =
      (index & 3) === 3 ? value / ROUNDED.scorch : value === ROUNDED.far ? ROUNDED.FAR : value === -ROUNDED.far ? -ROUNDED.FAR : value / ROUNDED.distance;
  }
}

/** A field's numbers as they come back from the tape, for comparing with what it shows. */
export function roundField(data: Float32Array) {
  const out = new Float32Array(data.length);
  dequantize(quantize(data), out);
  return out;
}

function writeDiff(data: Float32Array, cols: number, diff: FieldDiff) {
  const width = diff.right - diff.left + 1;
  const perCell = diff.values.length / (width * (diff.bottom - diff.top + 1));

  for (let row = 0; row <= diff.bottom - diff.top; row++) {
    dequantize(diff.values.subarray(row * width * perCell, (row + 1) * width * perCell), data, ((diff.top + row) * cols + diff.left) * perCell);
  }
}

function hashOf(data: Int16Array) {
  const words = new Uint16Array(data.buffer, data.byteOffset, data.length);
  let hash = 0x811c9dc5;

  for (let index = 0; index < words.length; index++) {
    hash = Math.imul(hash ^ words[index], 0x01000193);
  }

  return hash >>> 0;
}
