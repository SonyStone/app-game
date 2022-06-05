import { createMemo, createSignal } from 'solid-js';
import { Brand } from './interfaces/Brand.type';
import { COMPOSITE_OPERATIONS } from './interfaces/CompositeOperations';
import { Frame } from './interfaces/Frame';
import { getFrameSize, VIDEO_TIME_PRECISION } from './interfaces/VideoTime';
import { createContextProvider } from './utils/createContextProvider';

function createVideoContext(props: {}) {
  const [currentFrame, setCurrentFrame] = createSignal<Frame>(0 as Frame);
  const [totalFrames, setTotalFrames] = createSignal<Frame>(0 as Frame);
  const [volume, setVolume] = createSignal(0);
  const [brushSize, setBrushSize] = createSignal(20);
  const [brushColor, setBrushColor] = createSignal('#ffffff');
  const [brushComposite, setBrushComposite] = createSignal(
    COMPOSITE_OPERATIONS[0]
  );
  const [src, setSrc] = createSignal('https://i.imgur.com/Iza6kFw.mp4');
  const [fps, setFps] = createSignal(24);
  const [play, setPlay] = createSignal(false);

  const frameSize = createMemo(() => getFrameSize(fps()));
  const currentTime = createMemo(() =>
    framesToTimecode(currentFrame(), frameSize())
  );

  return [
    {
      brushComposite,
      currentTime,
      currentFrame,
      totalFrames,
      brushSize,
      volume,
      brushColor,
      src,
      fps,
      play,
      frameSize,
    },
    {
      setBrushComposite,
      setCurrentFrame,
      setTotalFrames,
      setBrushSize,
      setVolume,
      setBrushColor,
      setSrc,
      setFps,
      setPlay,
    },
  ] as const;
}

export const [VideoContextProvider, useVideoContext] =
  createContextProvider(createVideoContext);

export type Timecode = Brand<string, 'Timecode'>;

export function framesToTimecode(frame: Frame, frameSize: number): Timecode {
  const time = (frame * frameSize) / VIDEO_TIME_PRECISION;

  const hours = Math.floor(time / 3600) % 24;
  const minutes = Math.floor(time / 60) % 60;
  const seconds = Math.floor(time % 60);
  const frames = Math.floor(frame % (VIDEO_TIME_PRECISION / frameSize));

  const result =
    formatTimeItem(hours) +
    ':' +
    formatTimeItem(minutes) +
    ':' +
    formatTimeItem(seconds) +
    ':' +
    formatTimeItem(frames);

  return result as Timecode;
}

export function formatTimeItem(item: number): string {
  return item < 10 ? `0${item}` : `${item}`;
}
