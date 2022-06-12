import {
  animationFrameScheduler,
  EMPTY,
  fromEvent,
  map,
  mapTo,
  merge,
  ObservableInput,
  startWith,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs';
import { createEffect, createMemo, from, Show } from 'solid-js';
import { JSX as JSXRuntime } from 'solid-js/jsx-runtime';

import { Dimensions } from './interfaces/Dimensions.interface';
import { Frame } from './interfaces/Frame';
import {
  frameToVideoTime,
  VideoTime,
  videoTimeToFrame,
} from './interfaces/VideoTime';
import s from './Player.module.scss';

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      type: string;
    }
  }
}

interface Props extends JSXRuntime.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  // currentTime: number;
  currentFrame: Frame;
  frameSize: VideoTime;
  onCurrentFrame(value: Frame): void;
  onDimentions(value: Dimensions): void;
  onTotalFrames(value: Frame): void;
  play: boolean;
  volume: number;
  playbackRate: number;
}

export default function Video(props: Props) {
  return (
    <Show when={props.src}>
      {(src) => {
        const volume = createMemo<number>((volume) => {
          volume = props.volume ?? volume;

          return volume >= 1 ? 1 : volume <= 0 ? 0 : volume;
        }, 0);

        const playbackRate = createMemo<number>((playbackRate) => {
          playbackRate = props.playbackRate ?? playbackRate;

          return playbackRate;
        }, 0);

        const video: HTMLVideoElement = (
          <video
            {...props}
            src={src}
            class={s.video}
            attr:type="video/mp4"
            // onVolumeChange={props.onVolumeChange}
            onLoadedMetadata={() => {
              props.onDimentions?.({
                height: video.videoHeight,
                width: video.videoWidth,
              });
            }}
            onDurationChange={() => {
              if (props.onTotalFrames) {
                props.onTotalFrames(
                  videoTimeToFrame(video.duration, props.frameSize)
                );
              }
            }}></video>
        ) as HTMLVideoElement;

        const play$ = fromEvent(video, 'play');
        const pause$ = fromEvent(video, 'pause');

        const isPlaying$ = merge(
          play$.pipe(mapTo(true)),
          pause$.pipe(mapTo(false))
        ).pipe(startWith(!video.paused));

        const continuousUpdate = () =>
          timer(0, 0, animationFrameScheduler).pipe(
            map(() => video.currentTime),
            startWith(video.currentTime)
          );

        // fierd on set current frame
        const seeked$ = fromEvent(video, 'seeked').pipe(
          map(() => video.currentTime)
        );

        const time$ = isPlaying$.pipe(
          switchMap((isPlaying) => (isPlaying ? continuousUpdate() : EMPTY))
        );

        const time = from(merge(time$, seeked$));
        const frame = createMemo(() =>
          videoTimeToFrame(time(), props.frameSize)
        );

        let _frame: Frame;
        createEffect(() => {
          _frame = frame();
          if (_frame) {
            props.onCurrentFrame(_frame);
          }
        });

        createEffect(() => {
          const _currentFrame = props.currentFrame;

          if (_currentFrame && _frame !== _currentFrame) {
            console.log(`_frame`, _currentFrame, _frame);
            video.currentTime = frameToVideoTime(
              _currentFrame,
              props.frameSize
            );
          }
        });

        createEffect(() => {
          video.volume = volume();
        });

        createEffect(() => {
          video.playbackRate = playbackRate();
        });

        createEffect(() => {
          if (props.play) {
            console.log(`▶`);
            video.play();
          } else {
            console.log(`⏸`);
            video.pause();
          }
        });

        return video;
      }}
    </Show>
  );
}

function continuousUpdate(until: ObservableInput<any>) {
  return switchMap(() =>
    timer(0, 0, animationFrameScheduler).pipe(takeUntil(until))
  );
}
