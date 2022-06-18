import { createEventEffect } from '@utils/create-event-effect';
import { createEffect } from 'solid-js';

export interface PlaybackRateProps {
  media: HTMLMediaElement;
  playbackRate?: number;
  onPlaybackRateChange?(value: number): void;
}

export function PlaybackRateControl(
  props: PlaybackRateProps
): HTMLMediaElement {
  const media = props.media;

  let playbackRate = media.playbackRate;

  createEffect(() => {
    playbackRate = props.playbackRate ?? playbackRate;

    if (playbackRate >= 10) {
      media.playbackRate = 10;
    } else if (playbackRate >= 0.1) {
      media.playbackRate = playbackRate;
    } else if (playbackRate <= 0.1) {
      media.pause();
      media.playbackRate = 0.1;
    }
  });

  createEventEffect(media, 'ratechange', () => {
    props.onPlaybackRateChange?.(media.playbackRate);
  });

  return media;
}
