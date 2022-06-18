import { createSubscription } from '@utils/create-subscription';
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  map,
  mapTo,
  merge,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { createEffect, createMemo, untrack } from 'solid-js';

import { Frame } from '../interfaces/Frame';
import {
  frameToVideoTime,
  VideoTime,
  videoTimeToFrame,
} from '../interfaces/VideoTime';
import { mediaCurrentTime } from '../utils/mediaCurrentTime';
import { useIsPlayingContext } from './IsPlaying.provider';

interface Props {
  media: HTMLMediaElement;
  frameSize?: VideoTime;
  currentFrame?: Frame;
  onCurrentFrame?(value: Frame): void;
}

export function FrameControl(props: Props) {
  const media = props.media;

  function setLocalFrame(frame: Frame): void {
    media.currentTime = frameToVideoTime(frame, frameSize);
  }

  function getLocalFrame(): Frame {
    return videoTimeToFrame(media.currentTime, frameSize);
  }

  let currentFrame = 0;
  let frameSize = 0;

  createEffect(() => {
    frameSize = props.frameSize ?? 0;
  });

  createEffect(() => {
    const localFrame = getLocalFrame();
    currentFrame = props.currentFrame ?? 0;
    if (currentFrame !== localFrame) {
      setLocalFrame(currentFrame);
    }
  });

  const isPlaying$ = useIsPlayingContext();

  // fierd on set current frame
  const seekedTime$ = fromEvent(media, 'seeked').pipe(
    map(() => media.currentTime)
  );

  const playingTime$ = isPlaying$.pipe(
    switchMap((isPlaying) => (isPlaying ? mediaCurrentTime(media) : EMPTY)),
    startWith(media.currentTime)
  );

  const localCurrentFrame$ = merge(playingTime$, seekedTime$).pipe(
    map(getLocalFrame),
    distinctUntilChanged(),
    filter((localFrame) => currentFrame !== localFrame)
  );

  createEffect(() => {
    const onCurrentFrame = props.onCurrentFrame;
    if (!onCurrentFrame) {
      return;
    }

    const subscription = createSubscription();
    subscription.add(localCurrentFrame$.subscribe(onCurrentFrame));
  });

  return undefined;
}
