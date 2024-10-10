import { ObjectPoolFactory } from '@pixi-essentials/object-pool';
import { Container, MeshRope, Point, PointData, Texture } from 'pixi.js';
import { point } from '../pools';
import { createLocator } from './locator';
import trailUrl from './trail.png';

const WIND = point.allocate().set(0.5, 0.1);

const POINTS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((v) => v * 25).map((v) => point.allocate().set(v, v));

const fillArray = <T>(valueFn: () => T, length: number) => {
  const arr: T[] = [];
  for (let i = 0; i < length; i++) {
    arr.push(valueFn());
  }
  return arr;
};

const dissolveWind = () => point.allocate().set(Math.random() * 2.5, Math.random() * 2.5);

export const createRope = () => {
  const windPoints = point.allocateArray(POINTS.length);
  const points = point.allocateArray(POINTS.length);

  const trailTexture = Texture.from(trailUrl);
  const rope = new MeshRope({ texture: trailTexture, points });

  const reset = () => {
    rope.alpha = 1;
    rope.visible = true;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const windPoint = windPoints[i];

      windPoint.copyFrom(dissolveWind());
      point.copyFrom(POINTS[i]);
    }
  };

  return {
    obj: rope,
    reset,
    update() {
      rope.alpha -= 0.025;
      if (rope.alpha <= 0) {
        rope.visible = false;
      }
      if (rope.visible) {
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const windPoint = windPoints[i];

          point.add(WIND, point);
          point.add(windPoint, point);
        }
      }
    }
  };
};

class TrailEntitie {
  static trailTexture = Texture.from(trailUrl);
  windPoints = point.allocateArray(POINTS.length);
  points = point.allocateArray(POINTS.length);

  rope = new MeshRope({ texture: TrailEntitie.trailTexture, points: this.points });

  constructor() {
    this.rope.visible = false;
  }
}

export const trail = ObjectPoolFactory.build(TrailEntitie);
trail.reserve(1000);
trail.startGC();

function updateDisolveTrailGuard(item: any): boolean {
  return item.rope && item.points && item.windPoint;
}

function updateDisolveTrail(
  query: {
    rope: MeshRope;
    points: Point[];
    windPoints: Point[];
  }[]
) {
  for (const { rope, points, windPoints } of query) {
    rope.alpha -= 0.025;
    if (rope.alpha <= 0) {
      rope.visible = false;
    }
    if (rope.visible) {
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const windPoint = windPoints[i];

        point.add(WIND, point);
        point.add(windPoint, point);
      }
    }
  }
}

export const createTrail = (parent: Container, cam: Container) => {
  const historyX: number[] = [];
  const historyY: number[] = [];
  // historySize determines how long the trail will be.
  const historySize = 20;
  // ropeSize determines how smooth the trail will be.
  const ropeSize = 10;
  const points: Point[] = [];

  // Create history array.
  for (let i = 0; i < historySize; i++) {
    historyX.push(0);
    historyY.push(0);
  }
  // Create rope points.
  for (let i = 0; i < ropeSize; i++) {
    points.push(point.allocate().set(0, 0));
  }

  // Create the rope
  const trailTexture = Texture.from(trailUrl);
  const rope = new MeshRope({ texture: trailTexture, points });
  rope.blendMode = 'add';

  parent.addChild(rope);

  const locator = createLocator();
  locator.scale.set(100, 100);

  parent.addChild(locator);

  let mouseposition: PointData | undefined;
  // app.stage.interactive = true;
  // app.stage.hitArea = app.screen;
  parent.interactive = true;
  // parent.cursor = "cell";
  parent.on('click', (event: any) => {
    mouseposition = cam.toLocal(event.data.global);

    locator.position.copyFrom(mouseposition);

    for (let i = 0; i < historySize; i++) {
      historyX[i] = 0;
      historyY[i] = 0;
    }
  });

  return {
    mouseposition,
    historyX,
    historyY,
    ropeSize,
    points,
    historySize
  };
};

export type Trail = ReturnType<typeof createTrail>;

export function updateTrail(trail: Trail) {
  const { mouseposition, historyX, historyY, ropeSize, points, historySize } = trail;
  if (!mouseposition) {
    return;
  }

  // Update the mouse values to history

  historyX.pop();
  historyY.pop();
  historyX.unshift(mouseposition.x);
  historyY.unshift(mouseposition.y);

  // mouseposition = undefined;
  // Update the points to correspond with history.
  for (let i = 0; i < ropeSize; i++) {
    const p = points[i];

    // Smooth the curve with cubic interpolation to prevent sharp edges.
    const ix = cubicInterpolation(historyX, (i / ropeSize) * historySize);
    const iy = cubicInterpolation(historyY, (i / ropeSize) * historySize);

    p.x = ix;
    p.y = iy;
  }
}

function cubicInterpolation(array: any[], t: number, tangentFactor: number = 1) {
  const k = Math.floor(t);
  const m = [getTangent(k, tangentFactor, array), getTangent(k + 1, tangentFactor, array)];
  const p = [clipInput(k, array), clipInput(k + 1, array)];
  t -= k;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * t3 - 3 * t2 + 1) * p[0] + (t3 - 2 * t2 + t) * m[0] + (-2 * t3 + 3 * t2) * p[1] + (t3 - t2) * m[1];
}

/**
 * Cubic interpolation based on https://github.com/osuushi/Smooth.js
 */
function clipInput(k: number, arr: any[]) {
  if (k < 0) k = 0;
  if (k > arr.length - 1) k = arr.length - 1;
  return arr[k];
}

function getTangent(k: number, factor: number, array: any[]) {
  return (factor * (clipInput(k + 1, array) - clipInput(k - 1, array))) / 2;
}
