import { Vector2 } from '../utils';

import { Intersection } from './utils';

export class Velocity extends Vector2 {}

export class Acceleration extends Vector2 {}

export class Position extends Vector2 {}

export class Circle {
  radius = 0;

  reset() {
    this.radius = 0;
  }
}

export class CanvasContext {
  ctx: CanvasRenderingContext2D | null = null;
  width = 0;
  height = 0;
}

export class DemoSettings {
  speedMultiplier = 0.001;
}

export class PerformanceCompensation {
  delta!: number;
  time!: number;

  reset() {
    this.delta = 0;
    this.time = 0;
  }
}

export class Intersecting {
  points: Intersection[] = [];

  reset() {
    this.points.length = 0;
  }
}
