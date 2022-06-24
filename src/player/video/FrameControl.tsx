import { createSubscription } from '@utils/create-subscription';
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
} from 'rxjs';
import { createEffect } from 'solid-js';

import { Frame } from '../interfaces/Frame';
import {
  frameToVideoTime,
  VideoTime,
  videoTimeToFrame,
} from '../interfaces/VideoTime';
import { mediaCurrentTime } from '../utils/mediaCurrentTime';
import { useIsPlayingContext } from './IsPlaying.provider';
import { useMediaContext } from './Video';

interface Props {
  frameSize: VideoTime;
  currentFrame: Frame;
  onCurrentFrame(value: Frame): void;
}

export function FrameControl(props: Props) {
  const media = useMediaContext();

  let currentFrame = 0;
  let frameSize = 0;

  function setLocalFrame(frame: Frame): void {
    media.currentTime = frameToVideoTime(frame, frameSize);
  }

  function getLocalFrame(): Frame {
    return videoTimeToFrame(media.currentTime, frameSize);
  }

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
    filter(
      (localFrame) => !Number.isNaN(localFrame) && currentFrame !== localFrame
    )
  );

  const subscription = createSubscription();
  subscription.add(localCurrentFrame$.subscribe(props.onCurrentFrame));

  return undefined;
}
