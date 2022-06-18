import { JSX as JSXRuntime } from 'solid-js/jsx-runtime';
import { Dimensions } from '../interfaces/Dimensions.interface';
import { Frame } from '../interfaces/Frame';
import { VideoTime } from '../interfaces/VideoTime';

export interface VolumeProps {
  media: HTMLMediaElement;
  volume?: number;
  onVolumeChange?(value: number): void;
}

export interface Props
  extends Omit<
    JSXRuntime.VideoHTMLAttributes<HTMLVideoElement>,
    'onVolumeChange' | 'onPlay' | 'onPause'
  > {
  src: string;
  currentFrame?: Frame;
  frameSize?: VideoTime;
  onCurrentFrame?(value: Frame): void;
  onDimentions?(value: Dimensions): void;
  onTotalFrames?(value: Frame): void;
  play?: boolean;
  onPlay?(value: boolean): void;
  volume?: number;
  onVolumeChange?(value: number): void;
  playbackRate?: number;
  onPlaybackRateChange?(value: number): void;
}
