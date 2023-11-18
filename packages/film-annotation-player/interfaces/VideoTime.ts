import { Brand } from './Brand.type';
import { Frame } from './Frame';

/**
 * Время в ролике в секундах `float`. Милисекунду — число после запятой.
 * Возвращает `<video>` элемент
 * * `currentTime`
 * * `duration`
 */
export type VideoTime = Brand<number, 'VideoTime'> | number;

/**
 * Так как `video.currentTime` всегда возвращает
 * обрезанное число (0.041708) вместо полного (0.04170837504170838)
 * то `currentTime` переводим из `float` в `int` умножая на 1^6, чтобы совпадали значения.
 */
export const VIDEO_TIME_PRECISION = Math.pow(10, 6);

export function toVideoTime(time: number): VideoTime {
  return Math.floor(time * VIDEO_TIME_PRECISION) as VideoTime;
}

export function fromVideoTime(time: VideoTime): number {
  return (time / VIDEO_TIME_PRECISION) as VideoTime;
}

export function getFrameSize(fps: number): VideoTime {
  return Math.floor(VIDEO_TIME_PRECISION / fps) as VideoTime;
}

export function videoTimeToFrame(time: VideoTime, frameSize: number): Frame {
  return Math.floor((time * VIDEO_TIME_PRECISION) / frameSize) as Frame;
}

export function frameToVideoTime(frame: Frame, frameSize: number): VideoTime {
  return ((frame * frameSize) / VIDEO_TIME_PRECISION) as VideoTime;
}
