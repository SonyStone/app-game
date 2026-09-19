import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr, percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/** Measures the committed Block footprint at several views, independent of dormant preset controls. */
export async function verifyAbrBlock(report: (message: string) => void) {
  await initAbr();
  const preset = prepareAbrBrush({
    id: 'block',
    name: 'Block',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{
        textureEnabled: true,
        transferEnabled: true,
        shapeDynamicsEnabled: true,
        dualBrush: { kind: 'dualBrush', enabled: true },
        toolOptions: { kind: 'ErTl', eraserMode: 3, opacity: 1, flow: 1, usePressureOverridesSize: true }
      },
      tip: { kind: 'sampled', diameter: pixels(512), spacing: percent(500) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  for (const view of [
    { zoom: 1, angle: 0, mirrored: false },
    { zoom: 2, angle: 0, mirrored: false },
    { zoom: 0.5, angle: 0, mirrored: false },
    { zoom: 1, angle: Math.PI / 6, mirrored: false },
    { zoom: 1, angle: Math.PI / 6, mirrored: true }
  ]) {
    const document = createDocument();
    const base = Uint8Array.from({ length: 256 * 256 * 4 }, (_, i) => [90, 40, 10, 255][i % 4]!);
    document.commit([{ layerId: document.active.id, key: '0,0', before: undefined, after: base }]);
    const resources = createBrushResources();
    preset.resources.forEach((resource) => resources.put(resource));
    const errors: string[] = [];
    const renderer = await createPaintRenderer(new OffscreenCanvas(256, 256), (error) => errors.push(error), {
      cacheTiles: 1
    });
    try {
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          view,
          brush: { ...defaultBrush(), size: 512, opacity: 0.01, flow: 0.01 },
          processor: createRawProcessor(),
          settings: preset.engine.settings
        })
      );
      await stroke.add([{ x: 128, y: 128, pressure: 0.01, time: 0 }]);
      document.commit(await stroke.finish());
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const pixels = unpackTile(document.active.tiles.get('0,0')!);
      const erased: [number, number][] = [];
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const offset = (y * 256 + x) * 4;
          if (pixels[offset + 3] === 0) erased.push([x, y]);
          else if (pixels[offset + 3] !== 255) throw new Error('Block produced partial opacity.');
        }
      const area = (16 / view.zoom) ** 2;
      if (Math.abs(erased.length - area) > (view.angle ? 16 : 0))
        throw new Error(`Block area ${erased.length} differs from ${area} at zoom ${view.zoom}.`);
      // Undo the camera rotation/mirror in the engine so the displayed square remains axis-aligned.
      const projected = erased.map(([x, y]) => {
        x = (x - 128) * (view.mirrored ? -1 : 1);
        y -= 128;
        return [
          (x * Math.cos(view.angle) - y * Math.sin(view.angle)) * view.zoom,
          (x * Math.sin(view.angle) + y * Math.cos(view.angle)) * view.zoom
        ];
      });
      for (const axis of [0, 1]) {
        const coordinates = projected.map((point) => point[axis]!);
        const span = Math.max(...coordinates) - Math.min(...coordinates);
        if (span < 13 || span > 17) throw new Error(`Block screen extent ${span} disagrees with cursor.`);
      }
      document.undo();
      if (unpackTile(document.active.tiles.get('0,0')!).some((value, i) => value !== base[i]))
        throw new Error('Undo failed to restore Block erasure.');
    } finally {
      renderer.destroy();
      resources.dispose();
    }
  }
  report(
    'ABR Block: opaque square ignores saved tip/dynamics/opacity; 16 CSS px at 50/100/200% zoom, rotation/mirror and undo verified.'
  );
}
