import { onMount } from 'solid-js';
import { Context, main } from './main';

export default function Wireframe() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  const context = {
    mouse: { x: 0, y: 0, dx: 0, dy: 0 },
    canvas: document.createElement('canvas'),
    gl: canvas.getContext('webgl2')!,
  };

  // canvas.style.imageRendering = 'pixelated';
  // canvas.imageSmoothingEnabled = false;

  function handleWindowResize(event: UIEvent) {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
  }

  function handleMouseMove(event: MouseEvent) {
    const mouse = context.mouse!;
    const x = event.clientX;
    const y = event.clientY;
    mouse.dx = x - mouse.x;
    mouse.dy = y - mouse.y;
    mouse.x = x;
    mouse.y = y;
  }

  context.canvas.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', handleWindowResize);

  onMount(() => {
    // WebGL
    main(context as Context);
  });

  return <>{canvas}</>;
}
