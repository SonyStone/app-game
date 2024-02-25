import { onCleanup } from 'solid-js';
import { build } from '.';

export default function Dev() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  let canvasWidth = (canvas.width = window.innerWidth);
  let canvasHeight = (canvas.height = window.innerHeight);
  const ctx = canvas.getContext('2d')!;

  function resizeCanvas() {
    canvasWidth = canvas.width = window.innerWidth;
    canvasHeight = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resizeCanvas, false);

  const destory = build(ctx);

  onCleanup(() => {
    window.removeEventListener('resize', resizeCanvas);
    destory();
  });

  return canvas;
}
