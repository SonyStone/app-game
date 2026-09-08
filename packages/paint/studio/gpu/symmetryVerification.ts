import { defaultBrush, type Brush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { roundBrush } from '../composition/roundBrushEngine';
import { symmetryRenderer } from '../composition/symmetryRenderer';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { defaultPaintSymmetry, symmetryPoint, symmetryTransforms, type PaintSymmetry } from '../symmetry';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Real GPU regression: asymmetric masks, round paint/erase, signed tile boundaries, tails and one-step Undo. */
export async function verifyPaintSymmetry(report: (message: string) => void) {
  for (const cacheTiles of [1, 16]) {
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(512, 512), (error) => errors.push(error), {
      cacheTiles
    });
    const resources = createBrushResources();
    const tip = new Uint8Array(16 * 16);
    // An L with unequal arms makes accidental translation without UV reflection visible.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if ((x >= 2 && x <= 5 && y >= 2 && y <= 13) || (y >= 10 && y <= 13 && x >= 2 && x <= 12)) tip[y * 16 + x] = 255;
    const selected = viewerBrush({
      id: 'symmetry',
      name: 'Asymmetric symmetry',
      type: 'sampled',
      diameter: 32,
      spacing: 150,
      brushTip: { width: 16, height: 16, data: tip, depth: 8 },
      settings: { Brsh: { __classId: 'sampledBrush' }, toolOptions: { __classId: 'PbTl', flow: 100, Opct: 100 } }
    });
    selected.resources.forEach((resource) => resources.put(resource));
    try {
      for (const mode of ['vertical', 'horizontal', 'dual', 'diagonal', 'radial', 'mandala'] as const) {
        const state: PaintSymmetry = { ...defaultPaintSymmetry(), mode, segments: 4 };
        const document = createDocument();
        const brush: Brush = { ...defaultBrush(), engine: selected.engine, size: 32, flow: 1, opacity: 0.5 };
        const stroke = createResourceSession(resources, (resources) =>
          abrBrush.engine({
            resources,
            layer: document.active,
            brush,
            settings: { ...selected.engine.settings, seed: 1 },
            processor: {
              ...createRawProcessor(),
              // A disposable continuation travels well beyond the committed tap's radius.
              preview: () => [{ x: -220, y: -60, pressure: 1, time: 10 }]
            },
            renderer: symmetryRenderer(renderer, state)
          })
        );
        const point = { x: -90, y: -30, pressure: 1, time: 0 };
        await stroke.add([point]);
        // Disposable preview must not alter the committed copies.
        stroke.preview(true);
        stroke.preview(false);
        document.commit(await stroke.finish());
        const pixel = (x: number, y: number) => {
          const tx = Math.floor(x / 256),
            ty = Math.floor(y / 256);
          const tile = document.active.tiles.get(`${tx},${ty}`);
          return tile ? unpackTile(tile)[((y - ty * 256) * 256 + x - tx * 256) * 4 + 3]! : 0;
        };
        let colored = 0;
        // With integral quarter-turn/reflection transforms, centers map exactly to pixel centers.
        for (let y = -48; y < -12; y++)
          for (let x = -108; x < -72; x++) {
            const alpha = pixel(x, y);
            if (alpha) colored++;
            for (const transform of symmetryTransforms(state)) {
              const other = symmetryPoint({ x: x + 0.5, y: y + 0.5 }, transform);
              const actual = pixel(Math.round(other.x - 0.5), Math.round(other.y - 0.5));
              if (Math.abs(actual - alpha) > 1)
                throw new Error(`${mode}: asymmetric mask mismatch ${alpha}/${actual} at ${x},${y}`);
            }
          }
        if (colored < 100) throw new Error(`${mode}: missing source tip.`);
        for (const [key, data] of document.active.tiles) {
          const [tx, ty] = key.split(',').map(Number);
          const pixels = unpackTile(data);
          for (let i = 3; i < pixels.length; i += 4) {
            const pixel = (i - 3) / 4;
            if (pixels[i] && Math.hypot(tx! * 256 + (pixel % 256), ty! * 256 + Math.floor(pixel / 256)) > 120)
              throw new Error(`${mode}: disposable symmetry preview leaked into committed pixels.`);
          }
        }
        const before = [...document.active.tiles].map(([key, data]) => [key, [...unpackTile(data)]]);
        document.undo();
        renderer.reset();
        if (document.active.tiles.size) throw new Error(`${mode}: symmetry copies escaped the stroke Undo.`);
        document.redo();
        renderer.reset();
        if (
          JSON.stringify(before) !==
          JSON.stringify([...document.active.tiles].map(([key, data]) => [key, [...unpackTile(data)]]))
        )
          throw new Error(`${mode}: Redo changed symmetry pixels.`);
        renderer.reset();
      }
      const document = createDocument();
      const state: PaintSymmetry = { ...defaultPaintSymmetry(), mode: 'vertical' };
      let painted: [string, number[]][] = [];
      for (const tool of ['brush', 'eraser'] as const) {
        const brush = { ...defaultBrush(), tool, size: 18, flow: 1, opacity: 1, hardness: 1, pressureSize: false };
        const stroke = createResourceSession(resources, (resources) =>
          roundBrush.engine({
            resources,
            layer: document.active,
            brush,
            processor: createRawProcessor(),
            renderer: symmetryRenderer(renderer, state)
          })
        );
        await stroke.add([
          { x: -260, y: 250, pressure: 1, time: 0 },
          { x: -240, y: 275, pressure: 1, time: 10 }
        ]);
        document.commit(await stroke.finish());
        if (tool === 'brush' && document.active.tiles.size < 4)
          throw new Error('The mirrored round stroke did not cross tile boundaries.');
        for (const x of [-260, 259]) {
          const tx = Math.floor(x / 256);
          const tile = document.active.tiles.get(`${tx},0`);
          const alpha = tile ? unpackTile(tile)[(250 * 256 + x - tx * 256) * 4 + 3]! : 0;
          if (alpha !== (tool === 'brush' ? 255 : 0))
            throw new Error(`Mirrored ${tool} missed its contact at ${x},250: alpha ${alpha}.`);
        }
        const snapshot = (): [string, number[]][] =>
          [...document.active.tiles].map(([key, data]) => [key, [...unpackTile(data)]]);
        if (tool === 'brush') painted = snapshot();
        else {
          const erased = snapshot();
          document.undo();
          renderer.reset();
          if (JSON.stringify(snapshot()) !== JSON.stringify(painted))
            throw new Error('Undo did not restore both erased copies.');
          document.redo();
          renderer.reset();
          if (JSON.stringify(snapshot()) !== JSON.stringify(erased))
            throw new Error('Redo changed the mirrored eraser result.');
        }
      }
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      report(
        `Symmetry GPU: six modes, asymmetric mask, round paint/erase, Undo/Redo; ${cacheTiles}-tile cache passed.`
      );
    } finally {
      renderer.destroy();
      resources.dispose();
    }
  }
}
