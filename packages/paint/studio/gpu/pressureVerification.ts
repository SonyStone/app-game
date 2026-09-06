import { defaultBrush } from '../brush';
import { createDocument } from '../document';
import { createSmoothStroke } from '../smoothStroke';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Checks real GPU pixels for light stylus pressure and taper ramps across tile/frame boundaries. */
export async function verifyPressureSpacing(report: (message: string) => void) {
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (error) => errors.push(error), {
    cacheTiles: 2
  });
  try {
    for (const size of [32, 128, 512]) {
      for (const ramp of [false, true]) {
        renderer.reset();
        const document = createDocument();
        const brush = { ...defaultBrush(), size, color: '#ff0000', opacity: 0.6 };
        const sampler = createSmoothStroke(brush);
        renderer.begin(document.active, brush);
        for (let i = 0; i <= 64; i++) {
          const pressure = ramp ? 0.04 + Math.sin((i / 64) * Math.PI) * 0.66 : 0.04;
          await renderer.paint(sampler.add([{ x: 16.5 + i * 12, y: 128.5, pressure, time: i }]));
        }
        await renderer.paint(sampler.finish());
        const tiles = new Map((await renderer.finish()).map((change) => [change.key, unpackTile(change.after!)]));
        const alpha: number[] = [];
        for (let x = 40; x < 760; x++)
          alpha.push(tiles.get(`${Math.floor(x / 256)},0`)?.[(128 * 256 + (x % 256)) * 4 + 3] ?? 0);
        const minimum = Math.min(...alpha),
          maximum = Math.max(...alpha);
        if (minimum < 125 || maximum > 154)
          throw new Error(
            `${size}px ${ramp ? 'ramp' : 'light pressure'} has gaps or excess opacity: ${minimum}–${maximum}`
          );
        if (!ramp && maximum - minimum > 12)
          throw new Error(`${size}px light pressure has periodic stamp bands: ${minimum}–${maximum}`);
        report(
          `PASS: ${size}px ${ramp ? 'pressure taper' : '4% pressure'} stays continuous across three tile seams; alpha ${minimum}–${maximum}/255`
        );
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    renderer.destroy();
  }
}
