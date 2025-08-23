import { Particle, ParticleContainer, useApplication, useAsset } from '@packages/solid-pixi';
import { ParticleContainerOptions } from 'pixi.js';
import { useTick } from '../useTick';

export default function ParticleContainerExample(props: ParticleContainerOptions) {
  const [texture] = useAsset('https://pixijs.com/assets/bunny.png');
  const app = useApplication();

  const particles = Array.from(
    { length: 1000 },
    () =>
      (
        <Particle texture={texture()} x={Math.random() * app.screen.width} y={Math.random() * app.screen.height} />
      ) as ReturnType<typeof Particle>
  );

  useTick(() => {
    for (const element of particles) {
      element.x += Math.random() * 2 - 1; // Random horizontal movement
      element.y += Math.random() * 2 - 1; // Random vertical movement
    }
  });

  return (
    <ParticleContainer
      dynamicProperties={{
        position: true, // default
        scale: false,
        rotation: false,
        color: false
      }}
      {...props}
    >
      {particles}
    </ParticleContainer>
  );
}
