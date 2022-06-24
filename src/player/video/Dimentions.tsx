import { createEventEffect } from '@utils/create-event-effect';

import { Dimensions } from '../interfaces/Dimensions.interface';
import { useVideoContext } from './Video';

interface Props {
  onDimentions(value: Dimensions): void;
}

export default function Dimentions(props: Props & any) {
  const video = useVideoContext();

  createEventEffect(video, 'loadedmetadata', () => {
    props.onDimentions({
      height: video.videoHeight,
      width: video.videoWidth,
    });
  });

  return undefined;
}
