import { createContextProvider } from '@utils/createContextProvider';
import {
  distinctUntilChanged,
  fromEvent,
  mapTo,
  merge,
  shareReplay,
  startWith,
} from 'rxjs';

interface Props {
  media: HTMLMediaElement;
}

function createIsPlayingContext(props: Props) {
  const media = props.media;

  const play$ = fromEvent(media, 'play');
  const pause$ = fromEvent(media, 'pause');
  const ended$ = fromEvent(media, 'ended');

  const isPlaying$ = merge(
    play$.pipe(mapTo(true)),
    pause$.pipe(mapTo(false)),
    ended$.pipe(mapTo(false))
  ).pipe(startWith(!media.paused), distinctUntilChanged(), shareReplay(1));

  return isPlaying$;
}

export const [IsPlayingProvider, useIsPlayingContext] = createContextProvider(
  createIsPlayingContext
);
