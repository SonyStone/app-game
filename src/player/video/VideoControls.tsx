import { createEventEffect } from '@utils/create-event-effect';

import { Props } from './Props';

export function VideoControls(props: Props) {
  const video = props.children as HTMLVideoElement;

  console.log(`🔴 VideoControls created!`, video);

  // todo
  console.log(`video.networkState`, video.networkState);

  createEventEffect(video, '', (e) => {
    console.log('networkState', e);
  });

  console.log(`HTMLMediaElement.buffered`, video.buffered);
  createEventEffect(video, 'progress', () => {
    try {
      console.log(`--------`);
      for (let index = 0; index < video.buffered.length; index++) {
        console.log(
          `buffer ${index}`,
          video.buffered.start(index),
          video.buffered.end(index)
        );
      }
    } catch (error) {
      console.log(error);
    }
  });

  return video;
}
