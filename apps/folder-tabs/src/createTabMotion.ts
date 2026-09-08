import { createRAF } from '@solid-primitives/raf';
import { createEffect, createSignal, type Accessor } from 'solid-js';

/**
 * Follows tab destinations at a shared speed in screen-width units per second.
 * Distance determines arrival time; acceleration and braking keep starts/stops soft.
 * During a direct horizontal drag, `dragOffset` translates the painted positions
 * together, preserving any unfinished catch-up instead of snapping to destinations.
 * The owned RAF loop stops when settled or disposed. Reduced motion settles immediately.
 */
export function createTabMotion(
  targets: Accessor<readonly { id: string; x: number }[]>,
  dragOffset: Accessor<number | undefined>,
  reducedMotion: Accessor<boolean>,
  speed = 100
) {
  const current = new Map(targets().map(({ id, x }) => [id, { x, velocity: 0 }]));
  let destination = targets();
  const [positions, setPositions] = createSignal(new Map([...current].map(([id, value]) => [id, value.x])));
  let lastTime: number | undefined;
  let lastDrag: number | undefined;
  let looping = false;
  const acceleration = speed * 6;
  const [, start, stop] = createRAF((time) => {
    const dt = Math.min(0.032, lastTime === undefined ? 1 / 60 : (time - lastTime) / 1000);
    lastTime = time;
    let pending = false;
    for (const { id, x: target } of destination) {
      const value = current.get(id)!;
      const distance = target - value.x;
      if (Math.abs(distance) < 0.002) {
        value.x = target;
        value.velocity = 0;
        continue;
      }
      const desired = Math.sign(distance) * Math.min(speed, Math.sqrt(2 * acceleration * Math.abs(distance)));
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
    publish();
    if (!pending) halt();
  });

  function publish() {
    setPositions(new Map([...current].map(([id, value]) => [id, value.x])));
  }

  function halt() {
    stop();
    looping = false;
    lastTime = undefined;
  }

  createEffect(
    () => ({ targets: targets(), drag: dragOffset(), reduced: reducedMotion() }),
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
      if (!looping) {
        looping = true;
        start();
      }
    }
  );
  return positions;
}
