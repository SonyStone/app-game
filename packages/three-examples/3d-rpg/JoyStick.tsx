import { createEffect, createStore, createTrackedEffect } from 'solid-js';
import { createPointerdrag } from './create-pointerdrag';
import s from './JoyStick.module.scss';

export default function JoyStick(props: { maxRadius: number; onMove?: (forward: number, turn: number) => void }) {
  const maxRadius = props.maxRadius || 120;
  const maxRadiusSquared = maxRadius * maxRadius;

  const pointer = createPointerdrag();

  const [translate, setTranslate] = createStore<{ x: number; y: number }>({
    x: 0,
    y: 0
  });

  createEffect(pointer.up, (pointer) => {
    if (pointer) {
      setTranslate(() => ({ x: 0, y: 0 }));
      props.onMove?.(0, 0);
    }
  });

  createTrackedEffect(() => {
    const down = pointer.down();
    const move = pointer.move();
    if (down && move) {
      let x = move.clientX - down.clientX;
      let y = move.clientY - down.clientY;

      const sqMag = x * x + y * y;
      if (sqMag > maxRadiusSquared) {
        //Only use sqrt if essential
        const magnitude = Math.sqrt(sqMag);
        x /= magnitude;
        y /= magnitude;
        x *= maxRadius;
        y *= maxRadius;
      }

      setTranslate(() => ({
        x,
        y
      }));

      const forward = -y / maxRadius;
      const turn = -x / maxRadius;

      props.onMove?.(forward, turn);
    }
  });

  return (
    <div class={s.circle}>
      <div
        ref={pointer}
        style={{
          transform: `translate3d(${translate.x}px, ${translate.y}px, 0px)`,
          transition: pointer.pressed() ? '' : 'transform 200ms ease 0ms'
        }}
        class={s.thumb}
      ></div>
    </div>
  );
}
