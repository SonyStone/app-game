import { createEventEffect } from '@utils/create-event-effect';

import { Frame } from '../interfaces/Frame';
import { VideoTime, videoTimeToFrame } from '../interfaces/VideoTime';
import { useMediaContext } from './Video';

interface Props {
  onTotalFrames(value: Frame): void;
  frameSize: VideoTime;
}

export default function TotalFrames(props: Props) {
  const media = useMediaContext();

  createEventEffect(media, 'durationchange', () => {
    props.onTotalFrames(videoTimeToFrame(media.duration, props.frameSize));
  });

  return undefined;
}
