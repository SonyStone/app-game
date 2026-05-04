import { Container, MeshRope, useApplication, useAsset } from '@app-game/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { Point } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import { onCleanup, Show } from 'solid-js';

export default function PixijsExamlesMouseTrail() {
  const app = useApplication();
  const size = createWindowSize();
  const [trailTexture] = useAsset('https://pixijs.com/assets/trail.png');

  const historyX: number[] = [];
  const historyY: number[] = [];
  // historySize determines how long the trail will be.
  const historySize = 20;
  // ropeSize determines how smooth the trail will be.
  const ropeSize = 100;
  const points: Point[] = [];

  // Create history array.
  for (let i = 0; i < historySize; i++) {
    historyX.push(0);

    historyY.push(0);
  }
  // Create rope points.
  for (let i = 0; i < ropeSize; i++) {
    points.push(new Point(0, 0));
  }

  let mouseposition: { x: number; y: number } | null = null;

  const tickerCallback = () => {
    if (!mouseposition) return;

    // Update the mouse values to history
    historyX.pop();
    historyX.unshift(mouseposition.x);
    historyY.pop();
    historyY.unshift(mouseposition.y);
    // Update the points to correspond with history.
    for (let i = 0; i < ropeSize; i++) {
      const p = points[i];

      // Smooth the curve with cubic interpolation to prevent sharp edges.
      const ix = cubicInterpolation(historyX, (i / ropeSize) * historySize);
      const iy = cubicInterpolation(historyY, (i / ropeSize) * historySize);

      p.x = ix;
      p.y = iy;
    }
  };

  const ticker = app.ticker.add(tickerCallback);

  onCleanup(() => {
    ticker.remove(tickerCallback);
  });

  return (
    <Container>
      <Show when={trailTexture()}>
        <Container
          width={size.width}
          height={size.height}
          eventMode="static"
          interactive
          hitArea={app.screen}
          onmousemove={(event) => {
            mouseposition = mouseposition || { x: 0, y: 0 };
            mouseposition.x = event.global.x;
            mouseposition.y = event.global.y;
          }}
        >
          <MeshRope texture={trailTexture()} blendMode="add" points={points} />
        </Container>
      </Show>
    </Container>
  );
}

function getTangent(k: number, factor: number, array: number[]) {
  return (factor * (clipInput(k + 1, array) - clipInput(k - 1, array))) / 2;
}

function cubicInterpolation(array: number[], t: number, tangentFactor = 1) {
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
function clipInput(k: number, arr: number[]) {
  if (k < 0) k = 0;
  if (k > arr.length - 1) k = arr.length - 1;

  return arr[k];
}
