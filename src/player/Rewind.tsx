import { asObservable } from '@utils/as-observable';
import {
  animationFrameScheduler,
  distinctUntilChanged,
  EMPTY,
  filter,
  interval,
  map,
  Observable,
  switchMap,
  tap,
  timer,
} from 'rxjs';
import { untrack } from 'solid-js';

import { Frame } from './interfaces/Frame';

interface Props {
  rewind: number;
  currentFrame: Frame;
  onCurrentFrame(frame: Frame): void;
}

export default function Rewind(props: Props) {
  const rewind$ = asObservable(() => props.rewind);
  const currentFrame = () => untrack(() => props.currentFrame);

  animationFrameScheduler.schedule(function () {
    console.log(`schedule`);

    // this.schedule(undefined, 1000);
  });

  let intervalDuration = 0;
  let direction = 1;
  let time = 10;

  const change$ = rewind$
    .pipe(
      tap((value) => {
        intervalDuration = 10 * (value * value);
        direction = value > 0 ? 1 : value < 0 ? -1 : 0;
      }),
      map((rewind) => rewind > 0 || rewind < 0),
      distinctUntilChanged(),
      tap((v) => {
        console.log(`▶`, v);
      }),
      switchMap((rewind) =>
        rewind
          ? timer(0, 0, animationFrameScheduler).pipe(
              // tap((v) => {
              //   console.log(`intervalDuration`, intervalDuration, time);
              // }),
              filter(() => {
                time = time - intervalDuration;
                if (time <= 0) {
                  time = 10;
                  return true;
                }
                return false;
              })
            )
          : EMPTY
      )
    )
    .subscribe((rewind) => {
      const currentFrame = untrack(() => props.currentFrame);
      props.onCurrentFrame(currentFrame + direction);
    });

  // createEffect(() => {
  //   const rewind = props.rewind;
  //   const currentFrame = untrack(() => props.currentFrame);

  //   console.log(`rewind`, rewind);
  //   if (rewind > 0) {
  //     props.onCurrentFrame(currentFrame + 1);
  //   } else if (rewind < 0) {
  //     props.onCurrentFrame(currentFrame - 1);
  //   }
  // });

  return undefined;
}
