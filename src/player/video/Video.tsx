import { createEventEffect } from '@utils/create-event-effect';
import { createEffect, createMemo, onMount, Show, splitProps } from 'solid-js';

import { VideoTime, videoTimeToFrame } from '../interfaces/VideoTime';
import { FrameControl } from './FrameControl';
import { IsPlayingProvider } from './IsPlaying.provider';
import { PlaybackRateControl } from './PlaybackRateControl';
import { PlayControl } from './PlayControl';
import { Props } from './Props';
import TotalFrames from './TotalFrames';
import s from './Video.module.scss';
import { VideoControls } from './VideoControls';
import { VolumeControl } from './VolumeControl';

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      type: string;
    }
  }
}

// todo
// networkState
// preservesPitch

function Dimentions(props: Props & any) {
  const video = props.media;

  createEffect(() => {
    const onDimentions = props.onDimentions;
    if (!onDimentions) {
      return;
    }

    createEventEffect(video, 'loadedmetadata', () => {
      onDimentions({
        height: video.videoHeight,
        width: video.videoWidth,
      });
    });
  });

  return undefined;
}

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

      <TotalFrames {...props} media={video} />
      <Dimentions {...props} media={video} />
      <IsPlayingProvider media={video}>
        <PlayControl {...props} media={video} />
        <FrameControl {...props} media={video} />
      </IsPlayingProvider>
      <VideoControls {...props} children={video} />
      <VolumeControl {...props} media={video} />
      <PlaybackRateControl {...props} media={video} />
    </>
  );
}
