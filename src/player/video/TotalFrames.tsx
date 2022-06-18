import { createEventEffect } from '@utils/create-event-effect';
import { createEffect, createMemo } from 'solid-js';
import { Frame } from '../interfaces/Frame';

import { VideoTime, videoTimeToFrame } from '../interfaces/VideoTime';

interface Props {
  media: HTMLMediaElement;
  onTotalFrames?(value: Frame): void;
  frameSize?: VideoTime;
}

export default function TotalFrames(props: Props) {
  const media = props.media;

  createEffect(() => {
    const onTotalFrames = props.onTotalFrames;

    if (!onTotalFrames) {
      return;
    }

    const frameSize = createMemo(() => props.frameSize ?? 0, 0);

    createEventEffect(media, 'durationchange', () => {
      onTotalFrames(videoTimeToFrame(media.duration, frameSize()));
    });
  });

  return undefined;
}
