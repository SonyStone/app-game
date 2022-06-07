import {
  animationFrameScheduler,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  Observable,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { JSX as JSXRuntime } from 'solid-js/jsx-runtime';

import { Dimensions } from './interfaces/Dimensions.interface';
import { Frame } from './interfaces/Frame';
import {
  toVideoTime,
  VIDEO_TIME_PRECISION,
  VideoTime,
} from './interfaces/VideoTime';
import s from './Player.module.scss';
import { useVideoContext } from './VideoContext.provider';

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      type: string;
    }
  }
}

interface Props extends JSXRuntime.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  frameSize: VideoTime;
  onDimentions(value: Dimensions): void;
  onTotalFrames(value: Frame): void;
  play: boolean;
  volume: number;
}

export default function Video(props: Partial<Props>) {
  return (
    <Show when={props.src}>
      {(src) => {
        const video: HTMLVideoElement = (
          <video
            class={s.video}
            src={src}
            volume={0}
            attr:type="video/mp4"
            // onVolumeChange={props.onVolumeChange}
            onLoadedMetadata={() => {
              props.onDimentions?.({
                height: video.videoHeight,
                width: video.videoWidth,
              });
            }}
            onDurationChange={function () {
              if (props.onTotalFrames && props.frameSize) {
                const time = toVideoTime(video.duration);
                const frameSize = props.frameSize;
                const totalFrames = Math.floor(time / frameSize) as Frame;

                props.onTotalFrames(totalFrames);
              }
            }}
            {...props}></video>
        ) as HTMLVideoElement;

        // video.setAttribute('type', 'video/mp4');

        createEffect(() => {
          const volume = props.volume;
          if (volume! >= 0 && volume! <= 1) {
            video.volume = volume!;
          }
        });

        const [{ frameSize, currentFrame }, { setCurrentFrame }] =
          useVideoContext();

        const [isPaused, setPaused] = createSignal(false);

        createEffect(() => {
          if (isPaused()) {
            // ! Тут глюк с предидущем кадром
            const timeInt = currentFrame() * frameSize();
            video.currentTime = timeInt / VIDEO_TIME_PRECISION;
          }
        });

        createEffect(() => {
          const isPlay = props.play;

          if (isPlay) {
            video.play();
            setPaused(false);
          } else {
            video.pause();
            setPaused(true);
          }
        });

        const subscription = merge(
          videoPlaying(video)
          // fromEvent(video, 'seeked')
        )
          .pipe(
            map(() => {
              const timeInt = video.currentTime * VIDEO_TIME_PRECISION;
              return Math.floor(timeInt / frameSize()) as Frame;
            }),
            distinctUntilChanged()
          )
          .subscribe((frame) => setCurrentFrame(frame));

        onCleanup(() => subscription.unsubscribe());

        return video;
      }}
    </Show>
  );
}

function videoPlaying(video: HTMLVideoElement): Observable<number> {
  return fromEvent(video, 'play').pipe(
    switchMap(() =>
      timer(0, 0, animationFrameScheduler).pipe(
        takeUntil(fromEvent(video, 'pause'))
      )
    )
  );
}
