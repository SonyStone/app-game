import { createRAF } from '@solid-primitives/raf';
import { createEffect, createSignal, untrack, type Accessor } from 'solid-js';

/**
 * Follows scalar destinations at a shared speed in caller-defined units per second.
 * Distance determines arrival time; acceleration and braking keep starts/stops soft.
 * During a direct horizontal drag, `dragOffset` translates the painted positions
 * together, preserving any unfinished catch-up instead of snapping to destinations.
 * `speed` may track viewport geometry; changes retain the current position and velocity.
 * `directId` keeps just the grabbed item attached to its target while other items catch up.
 * The owned RAF loop stops when settled or disposed. Reduced motion settles immediately.
 */
export function createTabMotion(
  targets: Accessor<readonly { id: string; x: number }[]>,
  dragOffset: Accessor<number | undefined>,
  reducedMotion: Accessor<boolean>,
  speed: number | Accessor<number> = 100,
  directId: Accessor<string | undefined> = () => undefined
) {
  const current = new Map(untrack(targets).map(({ id, x }) => [id, { x, velocity: 0 }]));
  let destination = untrack(targets);
  const [positions, setPositions] = createSignal(new Map([...current].map(([id, value]) => [id, value.x])));
  let lastTime: number | undefined;
  let lastDrag: number | undefined;
  let looping = false;
  const [, start, stop] = createRAF((time) => {
    const maximumSpeed = typeof speed === 'function' ? speed() : speed;
    const acceleration = maximumSpeed * 6;
    // Integrate missed frames in small steps: slower displays keep the same speed,
    // without one large acceleration jump after the main thread is busy.
    let elapsed = Math.min(0.1, lastTime === undefined ? 1 / 60 : (time - lastTime) / 1000);
    lastTime = time;
    let pending = false;
    while (elapsed > 0.000001) {
      const dt = Math.min(1 / 60, elapsed);
      elapsed -= dt;
      pending = false;
      for (const { id, x: target } of destination) {
        const value = current.get(id)!;
        const distance = target - value.x;
        if (Math.abs(distance) < 0.002) {
          value.x = target;
          value.velocity = 0;
          continue;
        }
        const desired = Math.sign(distance) * Math.min(maximumSpeed, Math.sqrt(2 * acceleration * Math.abs(distance)));
        value.velocity += Math.max(-acceleration * dt, Math.min(acceleration * dt, desired - value.velocity));
        const step = value.velocity * dt;
        if (Math.sign(step) === Math.sign(distance) && Math.abs(step) >= Math.abs(distance)) {
          value.x = target;
          value.velocity = 0;
        } else {
          value.x += step;
          pending = true;
        }
      }
    }
    publish();
    if (!pending) halt();
  });

  function publish() {
    const previous = untrack(positions);
    if (previous.size === current.size && [...current].every(([id, value]) => previous.get(id) === value.x))
      return;
    setPositions(new Map([...current].map(([id, value]) => [id, value.x])));
  }

  function halt() {
    untrack(stop);
    looping = false;
    lastTime = undefined;
  }

  /** Transfers painted coordinates from another animator without changing destinations. */
  function rebase(painted: ReadonlyMap<string, number>) {
    for (const [id, x] of painted) {
      if (current.has(id)) current.set(id, { x, velocity: 0 });
    }
    lastTime = undefined;
    publish();
    if (!looping) {
      looping = true;
      untrack(start);
    }
  }

  createEffect(
    () => ({ targets: targets(), drag: dragOffset(), reduced: reducedMotion(), directId: directId() }),
    (next) => {
      destination = next.targets;
      const live = new Set(destination.map(({ id }) => id));
      for (const id of current.keys()) if (!live.has(id)) current.delete(id);
      for (const { id, x } of destination) if (!current.has(id)) current.set(id, { x, velocity: 0 });
      if (next.reduced) {
        halt();
        for (const { id, x } of destination) current.set(id, { x, velocity: 0 });
        lastDrag = next.drag;
        publish();
        return;
      }
      if (next.drag !== undefined) {
        halt();
        const shift = lastDrag === undefined ? 0 : lastDrag - next.drag;
        for (const value of current.values()) {
          value.x += shift;
          value.velocity = 0;
        }
        lastDrag = next.drag;
        publish();
        return;
      }
      lastDrag = undefined;
      const direct = destination.find(({ id }) => id === next.directId);
      if (direct) {
        current.set(direct.id, { x: direct.x, velocity: 0 });
        publish();
      }
      if (!looping) {
        looping = true;
        untrack(start);
      }
    }
  );
  return Object.assign(positions, { rebase });
}
