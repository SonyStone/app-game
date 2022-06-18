import { createEventEffect } from '@utils/create-event-effect';
import { createEffect, createMemo } from 'solid-js';

import { VolumeProps } from './Props';

export function VolumeControl(props: VolumeProps) {
  const media = props.media;

  const volume = createMemo<number>((volume) => {
    volume = props.volume ?? volume;

    return volume >= 1 ? 1 : volume <= 0 ? 0 : volume;
  }, 0);

  createEffect(() => {
    media.volume = volume();
  });

  createEffect(() => {
    const onVolumeChange = props.onVolumeChange;
    if (!onVolumeChange) {
      return;
    }

    createEventEffect(media, 'volumechange', () => {
      props.onVolumeChange?.(media.volume);
    });
  });

  return undefined;
}
