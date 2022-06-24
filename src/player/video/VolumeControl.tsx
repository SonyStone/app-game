import { createEventEffect } from '@utils/create-event-effect';
import { createEffect, createMemo } from 'solid-js';

import { useMediaContext } from './Video';

interface VolumeProps {
  volume: number;
  onVolumeChange(value: number): void;
}

export function VolumeControl(props: VolumeProps) {
  const media = useMediaContext();

  const volume = createMemo<number>((volume) => {
    volume = props.volume ?? volume;

    return volume >= 1 ? 1 : volume <= 0 ? 0 : volume;
  }, 0);

  createEffect(() => {
    media.volume = volume();
  });

  createEventEffect(media, 'volumechange', () => {
    props.onVolumeChange(media.volume);
  });

  return undefined;
}
