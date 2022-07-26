import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
} from 'solid-js';

import PauseIcon from '../../player/icons/pause.svg';
import PlayIcon from '../../player/icons/play.svg';
import { useStats } from '../../Stats.provider';
import s from './Animations.module.scss';
import { Box, Slider } from './Box';
import { back, bounce, linear } from './core/easing-2';
import { clamp, round } from './core/utils';

const width = 400;
const step = 0.01;

export default function () {
  const [time, setTime] = createSignal<number>(0);
  const [play, setPlay] = createSignal<boolean>(false);
  const [speed, setSpeed] = createSignal<number>(1);

  let id: number;
  let frame: number = 0;
  let spd: number = 0;

  createEffect(() => {
    spd = speed();
  });

  const stats = useStats();
  function tick(timestamp: number) {
    id = requestAnimationFrame(tick);
    stats.begin();
    frame = round(frame + spd / 60 / 2.5) % 1;
    setTime(round(frame < 0 ? 1 + frame : frame));

    stats.end();
  }

  createEffect(() => {
    if (play()) {
      tick(0);
    } else {
      frame = time();
      cancelAnimationFrame(id);
    }
  });

  onCleanup(() => {
    cancelAnimationFrame(id);
  });

  const setTimeClamp = (time: number) => setTime(clamp(0, 1, round(time)));

  return (
    <>
      <h1>Ease Animations</h1>
      <button onClick={() => setPlay(!play())}>
        {play() ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div>speed: {speed()}</div>
      <input
        style={{ width: `${width}px` }}
        type="range"
        value={speed()}
        min={-2}
        max={2}
        step={0.1}
        onInput={(e) => setSpeed(parseFloat((e.target as any).value))}
      />
      <div>time: {time()}</div>
      <input
        style={{ width: `${width}px` }}
        type="range"
        value={time()}
        min={0}
        max={1}
        step={0.0001}
        onKeyDown={(e) => {
          e.preventDefault();
          switch (e.code) {
            case 'ArrowRight':
              setTimeClamp(time() + step);
              break;
            case 'ArrowLeft':
              setTimeClamp(time() - step);
              break;
            default:
              break;
          }
        }}
        onWheel={(e) => {
          setTimeClamp(time() + (e.deltaY > 0 ? step : -step));
        }}
        onInput={(e) => setTime(parseFloat((e.target as any).value))}
      />
      <div class={s.container}>
        <For
          each={[
            {
              name: 'linear',
              fn: () => linear(time()),
            },
            {
              name: 'back.out',
              fn: () => back.out(time()),
            },
            {
              name: 'back.in',
              fn: () => back.in(time()),
            },
            {
              name: 'back.inOut',
              fn: () => back.inOut(time()),
            },
            {
              name: 'bounce.out',
              fn: () => bounce.out(time()),
            },
            {
              name: 'bounce.in',
              fn: () => bounce.in(time()),
            },
            {
              name: 'bounce.inOut',
              fn: () => bounce.inOut(time()),
            },
          ]}>
          {(item) => (
            <div class={s.example}>
              <div>{item.name}:</div>
              <Slider time={item.fn()} width={width} />
              <Box time={item.fn()} width={width} />
            </div>
          )}
        </For>
      </div>
    </>
  );
}
