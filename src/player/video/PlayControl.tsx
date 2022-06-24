import { createSubscription } from '@utils/create-subscription';
import { createEffect } from 'solid-js';

import { useIsPlayingContext } from './IsPlaying.provider';
import { useMediaContext } from './Video';

interface Props {
  play: boolean;
  onPlay(value: boolean): void;
}

export function PlayControl(props: Props) {
  const media = useMediaContext();

  createEffect(() => {
    if (props.play) {
      media.play();
    } else {
      media.pause();
    }
  });

  const isPlaying$ = useIsPlayingContext();
  const subscription = createSubscription();

  subscription.add(isPlaying$.subscribe(props.onPlay));

  return undefined;
}
