import { defaultBrush } from '@app-game/paint-core/brush';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/**
 * Low-flow round-brush build-up: many overlapping dabs must approach the analytic coverage 1 − (1 − flow)^n instead of
 * stalling where one dab's increment rounds away. Repeats each case with a one-tile cache that evicts and restores the
 * accumulated mask between dabs, so the mask readback keeps the same precision.
 */
export async function verifyFlowAccumulation(report: (message: string) => void) {
  const cases = [
    { flow: 0.02, dabs: 300 },
    { flow: 0.005, dabs: 1000 },
    { flow: 0.002, dabs: 3000 }
  ];
  const failures: string[] = [];
  for (const evicting of [false, true]) {
    for (const { flow, dabs } of cases) {
      const alpha = await paintedAlpha(flow, dabs, evicting);
      const expected = Math.round(255 * (1 - (1 - flow) ** dabs));
      const line = `flow ${flow * 100}% × ${dabs} dabs${evicting ? ' with eviction' : ''}: alpha ${alpha}, expected ${expected}`;
      report(line);
      if (Math.abs(alpha - expected) > 1) {
        failures.push(line);
      }
    }
  }

  if (failures.length) {
    throw new Error(`Low-flow strokes stall below their analytic coverage:\n${failures.join('\n')}`);
  }

  report('PASS: low-flow round-brush strokes build up to their analytic coverage, with and without mask eviction');
}

/** Paints `dabs` black dabs at one point (alternating with a far tile when `evicting`) and returns the center alpha. */
async function paintedAlpha(flow: number, dabs: number, evicting: boolean) {
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(64, 64), (message) => errors.push(message), {
    cacheTiles: evicting ? 1 : undefined
  });
  const document = createDocument();
  try {
    renderer.begin(document.active, { ...defaultBrush(), color: '#000000', size: 16, hardness: 1, opacity: 1 });
    const point = { x: 100.5, y: 100.5, radius: 8, flow };
    const far = { x: 100.5 + 256 * 4, y: 100.5, radius: 8, flow: 0 };
    const batch = evicting ? 1 : 100;
    for (let painted = 0; painted < dabs; painted += batch) {
      await renderer.paint(Array.from({ length: Math.min(batch, dabs - painted) }, () => point));
      if (evicting) {
        await renderer.paint([far]);
      }
    }

    document.commit(await renderer.finish());
    const tile = document.active.tiles.get('0,0');
    if (!tile || !(tile instanceof Uint8Array)) {
      throw new Error('The stroke did not commit its tile.');
    }

    if (errors.length) {
      throw new Error(errors.join('\n'));
    }

    return unpackTile(tile)[(100 * 256 + 100) * 4 + 3]!;
  } finally {
    renderer.destroy();
  }
}
