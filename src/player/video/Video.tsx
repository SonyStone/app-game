import createContextProvider from '@utils/createContextProvider';

import { Props } from './Props';
import s from './Video.module.scss';

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      type: string;
    }
  }
}

export const [VideoProvider, useVideoContext] = createContextProvider(
  (props: { video: HTMLVideoElement }) => props.video
);

export const [MediaProvider, useMediaContext] = createContextProvider(
  (props: { media: HTMLMediaElement }) => props.media
);

// todo
// networkState
// preservesPitch

export default function Video(props: Props) {
  let video!: HTMLVideoElement;

  return (
    <>
      <video
        ref={video}
        src={props.src}
        class={s.video}
        controls={true}
        attr:type="video/mp4"></video>
      <VideoProvider video={video}>
        <MediaProvider media={video}>{props.children}</MediaProvider>
      </VideoProvider>
    </>
  );
}
