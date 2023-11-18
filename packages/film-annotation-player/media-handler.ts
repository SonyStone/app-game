import { createSubscription } from '@utils/create-subscription';
import { resizeObservable } from '@utils/resize-observable';
import { toObservable } from '@utils/to-observable';
import { wrapSignal } from '@utils/wrap-signal';
import {
  animationFrameScheduler,
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
  timer
} from 'rxjs';
import { Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { EXAMPLE_VIDEOS } from './example-videos';
import { Dimensions } from './interfaces/Dimensions.interface';
import { Frame } from './interfaces/Frame';
import { frameToVideoTime, getFrameSize, VIDEO_TIME_PRECISION, videoTimeToFrame } from './interfaces/VideoTime';

enum NetworkState {
  NETWORK_EMPTY = 0,
  NETWORK_IDLE = 1,
  NETWORK_LOADING = 2,
  NETWORK_NO_SOURCE = 3
}

export function createVideoHandler() {
  const [media, setMedia] = createSignal<HTMLVideoElement | undefined>(undefined);

  const duration = createDuration(media);
  const [fps, setFps] = createSignal(24);
  const frameSize = createMemo(() => getFrameSize(fps()));
  const totalFrames = createMemo(() => videoTimeToFrame(duration(), frameSize()));

  const isPlaying = createIsPlaying(media);

  const [currentTime, setCurrentTime] = createCurrentTime(media, isPlaying);

  const [currentFrame, setCurrentFrame] = createCurrentFrame({
    media,
    currentTime,
    frameSize
  });

  const [volume, setVolume] = createVolume(media);
  const [playbackRate, setPlaybackRate] = createPlaybackRate(media);
  const [src, setSrc] = createSignal(EXAMPLE_VIDEOS[4].value);

  const dimentions = createDimentions(media);

  const currentTimecode = createMemo(() => framesToTimecode(currentFrame(), frameSize()));

  const progress = createBufferedProgress(media);
  const progressFramse = createMemo(() => {
    const _frameSize = frameSize();
    const _progress = progress();

    return _progress.map(
      ([start, end]) => [videoTimeToFrame(start, _frameSize), videoTimeToFrame(end, _frameSize)] as const
    );
  });

  const resize = createResize(media);

  // const isLoading = createIsLoading(media);

  // const networkState = createNetworkState(media);

  function setFrame(frame: Frame): void {
    const m = untrack(media);
    if (m) {
      m.currentTime = frameToVideoTime(frame, untrack(frameSize));
    }
  }

  // wrapSignal(
  //   media,
  //   (m) =>
  //     merge(
  //       ...[
  //         'abort',
  //         'canplay',
  //         'canplaythrough',
  //         // 'durationchange',
  //         // 'emptied',
  //         // 'ended',
  //         'error',
  //         'loadeddata',
  //         'loadedmetadata',
  //         'loadstart',
  //         // 'pause',
  //         // 'play',
  //         // 'playing',
  //         'progress',
  //         // 'ratechange',
  //         // 'seeked',
  //         // 'seeking',
  //         'stalled',
  //         'suspend',
  //         // 'timeupdate',
  //         // 'volumechange',
  //         'waiting'
  //       ].map((type) => fromEvent(m, type))
  //     ).pipe(
  //       tap((v) => {
  //         // console.log(`🔴`, v.type);
  //       })
  //     ),
  //   undefined
  // );

  return [
    {
      src,
      media,

      isPlaying,

      fps,
      duration,
      totalFrames,
      currentTime,
      currentFrame,
      currentTimecode,
      dimentions,
      resize,
      progress,
      progressFramse,

      volume,
      playbackRate
    },
    {
      setSrc,
      setMedia,
      setFps,
      setVolume,
      setPlaybackRate,
      setCurrentTime,
      setCurrentFrame,
      setFrame,
      play() {
        untrack(media)?.play();
      },
      pause() {
        untrack(media)?.pause();
      },
      playPause() {
        const m = untrack(media);
        if (m) {
          m.paused ? m.play() : m.pause();
        }
      },
      nextFrame() {
        setCurrentFrame((currentFrame() + 1) as Frame);
      },
      previousFrame() {
        setCurrentFrame((currentFrame() - 1) as Frame);
      }
    }
  ] as const;
}

function framesToTimecode(frame: Frame, frameSize: number) {
  const absFrame = Math.abs(frame);
  const suffix = frame < 0 ? -1 : 1;
  const time = (absFrame * frameSize) / VIDEO_TIME_PRECISION;

  const hours = Math.floor(time / 3600) % 24;
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);
  const frames = Math.floor(absFrame % (VIDEO_TIME_PRECISION / frameSize));

  return {
    suffix,
    hours,
    minutes,
    seconds,
    frames
  } as const;
}

/** Duration of Media Element in seconds? */
function createDuration(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>) {
  return wrapSignal(media, (m) => fromEvent(m, 'durationchange').pipe(map(() => m.duration)), 0);
}

function createIsPlaying(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>): Accessor<boolean> {
  const isPlaying = wrapSignal(
    media,
    (m) =>
      merge(...['play', 'pause', 'ended', 'emptied', 'abort'].map((type) => fromEvent(m, type))).pipe(
        map((event) => {
          switch (event.type) {
            case 'play':
              return true;
            case 'pause':
            case 'ended':
            case 'emptied':
            case 'abort':
            default:
              return false;
          }
        }),
        startWith(!m.paused)
      ),
    false
  );

  return isPlaying;
}

function createIsLoading(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>) {
  return wrapSignal(
    media,
    (media) =>
      merge(...['stalled', 'error', 'waiting', 'canplay'].map((type) => fromEvent(media, type))).pipe(
        map((event) => {
          switch (event.type) {
            case 'stalled':
            case 'error':
              return true;
            case 'canplay':
            case 'progress':
            default:
              return false;
          }
        })
      ),
    false
  );
}

function createNetworkState(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>) {
  return wrapSignal(
    media,
    (media) =>
      merge(
        ...['loadstart', 'progress', 'suspend', 'abort', 'error', 'emptied', 'stalled'].map((type) =>
          fromEvent(media, type)
        )
      ).pipe(
        // tap((v) => {
        //   console.log(`log-name`, v.type, media.networkState);
        // }),
        map(() => media.networkState as NetworkState)
      ),
    NetworkState.NETWORK_EMPTY
  );
}

function createCurrentTime(
  media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>,
  isPlaying: Accessor<boolean>
) {
  const currentTime = wrapSignal(
    media,
    (m) =>
      merge(
        toObservable(isPlaying).pipe(
          switchMap((isPlaying) => (isPlaying ? timer(0, 0, animationFrameScheduler) : EMPTY))
        ),
        fromEvent(m, 'seeked'),
        fromEvent(m, 'emptied'),
        fromEvent(m, 'timeupdate')
      ).pipe(
        map(() => m.currentTime),
        startWith(m.currentTime)
      ),
    0
  );

  function setCurrentTime(currentTime: number) {
    const m = untrack(media);

    if (!m) {
      return;
    }

    m.currentTime = currentTime;
  }

  return [currentTime, setCurrentTime] as const;
}

// No clue how it works, but it works
function createCurrentFrame(props: {
  media: Accessor<HTMLVideoElement | undefined>;
  currentTime: Accessor<number>;
  frameSize: Accessor<number>;
}) {
  const [currentFrame, setCurrentFrame] = createSignal<Frame>(0);

  let _currentFrame = 0;
  let _frameSize = 0;

  function setLocalFrame(frame: Frame): void {
    const media = untrack(props.media);
    if (media) {
      media.currentTime = frameToVideoTime(frame, _frameSize);
    }
  }

  function getLocalFrame(): Frame {
    const media = untrack(props.media);
    return videoTimeToFrame(media?.currentTime ?? 0, _frameSize);
  }

  createEffect(() => {
    _frameSize = props.frameSize() ?? 0;
  });

  createEffect(() => {
    const localFrame = getLocalFrame();
    _currentFrame = currentFrame() ?? 0;
    if (_currentFrame !== localFrame) {
      setLocalFrame(_currentFrame);
    }
  });

  const localCurrentFrame$ = toObservable(props.currentTime).pipe(
    map(getLocalFrame),
    distinctUntilChanged(),
    filter((localFrame) => !Number.isNaN(localFrame) && _currentFrame !== localFrame)
  );

  const subscription = createSubscription();
  subscription.add(localCurrentFrame$.subscribe(setCurrentFrame));

  return [currentFrame, setCurrentFrame] as const;
}

function createPlaybackRate(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>) {
  const playbackRate = wrapSignal(
    media,
    (m) =>
      fromEvent(m, 'ratechange').pipe(
        map(() => m.playbackRate),
        startWith(m.playbackRate)
      ),
    1
  );

  function setPlaybackRate(playbackRate: number) {
    const m = untrack(media);

    if (!m) {
      return;
    }

    if (playbackRate >= 10) {
      m.playbackRate = 10;
    } else if (playbackRate >= 0.1) {
      m.playbackRate = playbackRate;
    } else if (playbackRate <= 0.1) {
      m.pause();
      m.playbackRate = 0.1;
    }
  }

  return [playbackRate, setPlaybackRate] as const;
}

function createVolume(media: Accessor<HTMLVideoElement | HTMLMediaElement | undefined>) {
  const volume = wrapSignal(
    media,
    (m) =>
      fromEvent(m, 'volumechange').pipe(
        map(() => m.volume),
        startWith(m.volume)
      ),
    1
  );

  function setVolume(volume: number) {
    const m = untrack(media);

    if (!m) {
      return;
    }

    volume = volume >= 1 ? 1 : volume <= 0 ? 0 : volume;

    m.volume = volume;
  }

  return [volume, setVolume] as const;
}

function createDimentions(media: Accessor<HTMLVideoElement | undefined>) {
  return wrapSignal(
    media,
    (m) =>
      fromEvent(m, 'loadedmetadata').pipe(
        map(
          () =>
            ({
              height: m.videoHeight,
              width: m.videoWidth
            }) as Dimensions
        ),
        startWith({
          height: m.videoHeight,
          width: m.videoWidth
        } as Dimensions)
      ),
    {
      height: 0,
      width: 0
    } as Dimensions
  );
}

function createBufferedProgress(media: Accessor<HTMLVideoElement | undefined>) {
  return wrapSignal(
    media,
    (media) =>
      fromEvent(media, 'progress').pipe(
        map(() => {
          const buffer = [];
          for (let index = 0; index < media.buffered.length; index++) {
            buffer.push([media.buffered.start(index), media.buffered.end(index)] as const);
          }

          return buffer;
        })
      ),
    []
  );
}

function createResize(element: Accessor<HTMLElement | undefined>) {
  return wrapSignal(
    element,
    (element) =>
      resizeObservable(element).pipe(
        map((entries) => ({
          height: entries[0].contentRect.height,
          width: entries[0].contentRect.width
        }))
      ),
    { height: 0, width: 0 }
  );
}
