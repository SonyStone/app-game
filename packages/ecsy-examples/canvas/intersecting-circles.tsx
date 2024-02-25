import { onCleanup } from 'solid-js';
import { EcsCanvas } from './ecs-canvas';

export default function IntersectingCircles() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  const app = new EcsCanvas();

  app.run(canvas);

  onCleanup(() => {
    app.destroy();
  });

  return canvas;
}
