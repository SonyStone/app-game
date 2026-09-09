import { defaultBrush, type Dab } from '../brush';
import { createDocument, type TileChange } from '../document';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Compares bounded, recycled GPU resources and oversized instance batches against a roomy reference. */
export async function verifyBrushBatches(report: (message: string) => void) {
  const errors: string[] = [];
  const make = async (cacheTiles: number) => {
    const document = createDocument();
    const base = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) base.set([x % 80, y % 100, 20, 128], (y * 256 + x) * 4);
    document.commit([{ layerId: document.active.id, key: '0,0', before: undefined, after: base }]);
    const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (error) => errors.push(error), {
      cacheTiles
    });
    return { document, renderer };
  };
  const small = await make(2),
    reference = await make(128);
  const brush = { ...defaultBrush(), color: '#ee3344', opacity: 0.45, flow: 0.3 };
  const compare = (a: TileChange[], b: TileChange[], label: string) => {
    const expected = new Map(b.map((change) => [change.key, change.after]));
    if (a.length !== b.length) throw new Error(`${label}: tile count differs`);
    for (const change of a) {
      if (!expected.has(change.key)) throw new Error(`${label}: unexpected tile ${change.key}`);
      const actual = change.after,
        other = expected.get(change.key);
      if (!actual || !other) {
        if (actual !== other) throw new Error(`${label}: wrong transparency in ${change.key}`);
        continue;
      }
      const pixels = unpackTile(actual),
        wanted = unpackTile(other);
      if (pixels.some((byte, i) => byte !== wanted[i])) throw new Error(`${label}: pixels differ in ${change.key}`);
    }
    report(`PASS: ${label}; ${a.length} tiles byte-identical to the reference`);
  };
  try {
    for (const run of [small, reference]) run.renderer.begin(run.document.active, brush);
    const many: Dab[] = Array.from({ length: 2300 }, (_, i) => ({
      x: i < 1024 ? 60 : i < 2048 ? 190 : 128,
      y: i < 1024 ? 60 : i < 2048 ? 180 : 95,
      radius: 12 + (i % 3),
      flow: 0.01
    }));
    await small.renderer.paint(many);
    for (let i = 0; i < many.length; i += 97) await reference.renderer.paint(many.slice(i, i + 97));
    const first = await small.renderer.finish(),
      firstReference = await reference.renderer.finish();
    compare(first, firstReference, '2300 stamps cross multiple instance-buffer uploads without losing earlier chunks');
    small.document.commit(first);
    reference.document.commit(firstReference);

    for (const run of [small, reference]) run.renderer.begin(run.document.active, brush);
    const sweep: Dab[] = Array.from({ length: 12 }, (_, i) => ({
      x: i * 300 - 1800,
      y: 50 + (i % 3) * 270,
      radius: 256,
      flow: 0.35
    }));
    await small.renderer.paint(sweep);
    for (const dab of sweep) await reference.renderer.paint([dab]);
    // Return to the beginning after its scratch resources have been reassigned many times.
    const revisit = [
      { ...sweep[0]!, flow: 0.5 },
      { x: 128, y: 128, radius: 10, flow: 0.2 }
    ];
    await small.renderer.paint(revisit);
    await reference.renderer.paint(revisit);
    const second = await small.renderer.finish(),
      secondReference = await reference.renderer.finish();
    compare(
      second,
      secondReference,
      'two recycled slots preserve mask, immutable base and output across 512px stamps and revisits'
    );
    small.document.commit(second);
    reference.document.commit(secondReference);
    for (const run of [small, reference]) {
      run.renderer.begin(run.document.active, { ...brush, tool: 'eraser', opacity: 1 });
      await run.renderer.paint([{ x: -128, y: -128, radius: 250, flow: 1 }]);
    }
    const erased = await small.renderer.finish(),
      erasedReference = await reference.renderer.finish();
    compare(erased, erasedReference, 'eraser preserves transparent output and pixels outside the damage rectangle');
    small.document.commit(erased);
    reference.document.commit(erasedReference);
    for (const run of [small, reference]) {
      run.renderer.begin(run.document.active, brush);
      await run.renderer.paint([{ x: 128, y: 128, radius: 120, flow: 1 }]);
      run.renderer.cancel();
      run.renderer.begin(run.document.active, { ...brush, color: '#33bb55', opacity: 0.2 });
      await run.renderer.paint([{ x: 7000, y: -7000, radius: 256, flow: 0.5 }]);
    }
    compare(
      await small.renderer.finish(),
      await reference.renderer.finish(),
      'new empty tiles contain no recycled colour or cancelled mask'
    );
    if (small.renderer.stats().residentTiles > 2) throw new Error('Recycling increased the scratch budget');
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    small.renderer.destroy();
    reference.renderer.destroy();
  }
}
