import { LGraph, LGraphCanvas } from '@app-game/litegraph/litegraph';
import { onSettled } from 'solid-js';

export default function litegraph() {
  const canvas = (<canvas class="max-w-1024px aspect-square w-full" />) as HTMLCanvasElement;

  let graph = new LGraphCanvas(canvas, new LGraph());

  onSettled(() => {
    graph.draw();
  });

  return canvas;
}
