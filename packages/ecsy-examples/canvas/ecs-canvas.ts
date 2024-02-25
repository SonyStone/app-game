import { World } from '@packages/ecsy';

import {
  Acceleration,
  CanvasContext,
  Circle,
  DemoSettings,
  PerformanceCompensation,
  Position,
  Velocity
} from './components';
import {
  IntersectionSystem,
  MovementSystem,
  RendererBackground,
  RendererCircles,
  RendererIntersecting
} from './systems';
import { random } from './utils';

export class EcsCanvas {
  renderer = {
    createElement: <K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions) =>
      document.createElement(tagName, options),
    appendChild: (parent: Node, newChild: Node) => parent.appendChild(newChild)
  };

  elementRef = {
    nativeElement: document.body
  };

  private resizeCanvas: () => void;
  private animationFrameId: number;
  private world: World;

  run(canvas: HTMLCanvasElement) {
    const world = (this.world = new World());

    world
      .registerSystem(MovementSystem)
      .registerSystem(IntersectionSystem)
      .registerSystem(RendererBackground)
      // .registerSystem(Movement)
      // .registerSystem(Intersection)
      .registerSystem(RendererCircles)
      .registerSystem(RendererIntersecting);
    // .registerSystem(Renderer)

    // Used for singleton components
    const singletonEntity = world
      .createEntity()
      .addComponent(PerformanceCompensation)
      .addComponent(CanvasContext)
      .addComponent(DemoSettings);

    this.renderer.appendChild(this.elementRef.nativeElement, canvas);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const canvasComponent = singletonEntity.getMutableComponent(CanvasContext);
    canvasComponent.ctx = canvas.getContext('2d');
    canvasComponent.width = canvas.width;
    canvasComponent.height = canvas.height;

    for (let i = 0; i < 200; i++) {
      world
        .createEntity()
        .addComponent(Circle, { radius: random(20, 100) })
        .addComponent(Velocity, {
          x: random(-200, 200),
          y: random(-200, 200)
        })
        .addComponent(Acceleration)
        .addComponent(Position, {
          x: random(0, canvas.width),
          y: random(0, canvas.height)
        });
    }

    this.resizeCanvas = function () {
      canvasComponent.width = canvas.width = window.innerWidth;
      canvasComponent.height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', this.resizeCanvas, false);

    const performanceCompensation = singletonEntity.getMutableComponent(PerformanceCompensation);

    let lastTime = performance.now();

    let timeOut = 0;

    const update = () => {
      const time = performance.now();
      performanceCompensation.delta = time - lastTime;
      lastTime = time;

      world.run();

      this.animationFrameId = requestAnimationFrame(update);

      if (timeOut > 0) {
        timeOut--;
      }
    };

    update();

    console.log(`world`, world);
  }

  destroy() {
    this.world.stop();
    window.removeEventListener('resize', this.resizeCanvas);
    cancelAnimationFrame(this.animationFrameId);
  }
}
