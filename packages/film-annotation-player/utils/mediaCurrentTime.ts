import { animationFrameScheduler, map, startWith, timer } from 'rxjs';
import { createSignal, createTrackedEffect, onCleanup } from 'solid-js';

export function mediaCurrentTime(media: HTMLMediaElement) {
  return timer(0, 0, animationFrameScheduler).pipe(
    map(() => media.currentTime),
    startWith(media.currentTime)
  );
}

export function mediaCurrentTime2(media: HTMLMediaElement) {
  const [currentTime, setCurrentTime] = createSignal(media.currentTime);

  const set = () => setCurrentTime(media.currentTime);
  let id: number;
  createTrackedEffect(() => {
    id = requestAnimationFrame(set);
  });

  onCleanup(() => {
    cancelAnimationFrame(id);
  });

  return currentTime;
}
