import { LGraph, LGraphCanvas } from '@packages/litegraph/litegraph';
import { onMount } from 'solid-js';

export default function litegraph() {
  const canvas = (<canvas class="max-w-1024px aspect-square w-full" />) as HTMLCanvasElement;

  let graph = new LGraphCanvas(canvas, new LGraph());

  onMount(() => {
    graph.draw();
  });

  return canvas;
}
