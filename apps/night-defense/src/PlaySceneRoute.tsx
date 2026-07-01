import { createWindowSize } from '@solid-primitives/resize-observer';
import { NightDefenseScene } from './NightDefenseScene';

export default function PlaySceneRoute() {
  const size = createWindowSize();

  return <NightDefenseScene width={size.width} height={size.height} />;
}
