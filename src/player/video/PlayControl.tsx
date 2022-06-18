import { createSubscription } from '@utils/create-subscription';
import { createEffect } from 'solid-js';

import { useIsPlayingContext } from './IsPlaying.provider';

interface Props {
  media: HTMLMediaElement;
  play?: boolean;
  onPlay?(value: boolean): void;
}

export function PlayControl(props: Props) {
  const media = props.media;

  createEffect(() => {
    if (props.play) {
      media.play();
    } else {
      media.pause();
    }
  });

  const isPlaying$ = useIsPlayingContext();
  const subscription = createSubscription();

  createEffect(() => {
    const onPlay = props.onPlay;
    if (!onPlay) {
      return;
    }
    subscription.add(isPlaying$.subscribe(onPlay));
  });

  return undefined;
}
