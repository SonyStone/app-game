import { generatePreviewTip } from '@app-game/abr-brush/physical-tip';
import { syntheticPath, type PreviewPoint } from '@app-game/abr-brush/stroke';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import { TILE_SIZE, type Sample } from '../brush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createAbrProcessor } from '../composition/abrStrokeProcessor';
import type { BrushSession } from '../composition/contracts';
import { createResourceSession } from '../composition/resourceSession';
import { roundBrush } from '../composition/roundBrushEngine';
import { texturedBrush } from '../composition/texturedBrushEngine';
import type { Layer } from '../document';
import { createPaintRenderer } from '../gpu/renderer';
import { polygonSelection } from '../selectionMask';
import { studioProcessors } from '../strokeProcessors';
import { retouchFixture } from './fixture';
import { preparePreview } from './prepare';
import type { PreviewConfiguration, PreviewJob, PreviewReply } from './protocol';
import { createPreviewResourceCache } from './resourceCache';
import { renderResourcePixels } from './resourcePixels';

/** One serial engine/renderer owner for every preview. The active document lasts for one gesture. */
export function createPreviewRuntime(rendererFactory = createPaintRenderer) {
  const canvas = new OffscreenCanvas(1, 1);
  const cache = createBrushResources();
  const decoded = createPreviewResourceCache();
  const loaded = new Set<string>();
  let renderer: Awaited<ReturnType<typeof createPaintRenderer>> | undefined;
  let session: BrushSession | undefined;
  let current: { target: number; revision: number; configuration: PreviewConfiguration; layers: Layer[] } | undefined;
  let documentId = 0;
  let lost: string | undefined;

  function close() {
    session?.cancel();
    session = undefined;
    for (const layer of current?.layers ?? []) {
      renderer?.releaseLayer(layer.id);
    }
    current = undefined;
  }

  return {
    /** Called serially by the worker; no stroke input is reprocessed or cached as an intermediate bitmap. */
    async run(job: PreviewJob): Promise<PreviewReply> {
      const start = performance.now();
      if (job.action === 'cancel') {
        if (current?.target === job.target) {
          close();
        }
        return { type: 'done', id: job.id };
      }

      try {
        if (lost) {
          throw new Error(lost);
        }
        if (job.action === 'sample' || job.action === 'begin') {
          close();
          const configuration = job.configuration!;
          await initAbr();
          if (configuration.kind === 'abr' && configuration.input.resourcePreview) {
            const input = configuration.input;
            const tip = configuration.tip ?? generatePreviewTip(input.values);
            const image = new ImageData(
              renderResourcePixels(input, tip, decoded.read(configuration.resources ?? {})),
              input.width,
              input.height
            );
            const bitmap = await createImageBitmap(image);
            return { type: 'image', id: job.id, bitmap, renderMs: performance.now() - start };
          }

          renderer ??= await rendererFactory(canvas, (message) => {
            lost = message;
          });
          if (lost) {
            throw new Error(lost);
          }
          renderer.restoreTools({ version: 1 });
          const prepared = preparePreview(configuration, job.action === 'begin', decoded.read);
          for (const resource of prepared.resources) {
            if (!loaded.has(resource.id)) {
              for (const id of cache.put(resource)) {
                loaded.delete(id);
              }
              loaded.add(resource.id);
            }
          }

          const { layers, layer, historySource } = previewLayers(configuration, ++documentId, prepared.brush);
          current = { target: job.target, revision: job.revision, configuration, layers };
          const brush = prepared.brush;
          renderer.setLinearBlending(brush.mixing === 'linear');
          const width = configuration.width / configuration.dpr;
          const height = configuration.height / configuration.dpr;
          renderer.clipStroke(
            polygonSelection([
              { x: 0, y: 0 },
              { x: width, y: 0 },
              { x: width, y: height },
              { x: 0, y: height }
            ])
          );
          const engine = engines[brush.engine?.id ?? 'round'];
          if (!engine) {
            throw new Error(`Preview engine ${brush.engine?.id} is not registered.`);
          }
          const processor =
            brush.engine?.id === 'abr' && brush.stroke.mode !== 'none'
              ? createAbrProcessor(brush, 1)
              : studioProcessors[brush.stroke.mode](brush, 1);
          session = createResourceSession(cache, (resources) =>
            engine({
              brush,
              settings: brush.engine?.settings,
              resources,
              renderer: renderer!,
              layer,
              layers,
              historySource,
              processor,
              seed: 12345,
              adaptiveQuality: false
            })
          );
        }

        if (!session || !current || current.target !== job.target || current.revision !== job.revision) {
          return { type: 'done', id: job.id };
        }

        const { configuration, layers } = current;
        const points = job.action === 'sample' ? syntheticPath() : job.points;
        let idle = !!session.idle;
        if (points.length) {
          await session.add(toSamples(points, configuration));
        } else if (job.action === 'add') {
          idle = (await session.idle?.(job.elapsedMs ?? 0)) ?? false;
          if (!idle) {
            return { type: 'done', id: job.id };
          }
        }

        if (job.action === 'finish' || job.action === 'sample' || job.end) {
          const changes = await session.finish();
          session = undefined;
          for (const change of changes) {
            const layer = layers.find((layer) => layer.id === change.layerId)!;
            if (change.after) {
              layer.tiles.set(change.key, change.after);
            } else {
              layer.tiles.delete(change.key);
            }
          }
          idle = false;
        } else {
          session.preview(true);
        }

        await renderer!.render(
          layers,
          {
            x: configuration.width / configuration.dpr / 2,
            y: configuration.height / configuration.dpr / 2,
            zoom: 1,
            angle: 0,
            mirrored: false
          },
          { width: configuration.width / configuration.dpr, height: configuration.height / configuration.dpr },
          configuration.dpr
        );
        const bitmap = canvas.transferToImageBitmap();
        if (!session) {
          close();
        }
        return { type: 'image', id: job.id, bitmap, renderMs: performance.now() - start, idle };
      } catch (error) {
        close();
        return { type: 'error', id: job.id, message: error instanceof Error ? error.message : String(error) };
      }
    },
    /** Cancels borrowed resources before releasing renderer/device ownership. */
    dispose() {
      close();
      cache.dispose();
      decoded.clear();
      renderer?.destroy();
    }
  };
}

const engines: Record<string, typeof abrBrush.engine> = {
  abr: abrBrush.engine,
  round: roundBrush.engine,
  textured: texturedBrush.engine
};

function toSamples(points: readonly PreviewPoint[], configuration: PreviewConfiguration): Sample[] {
  return points.map((point) => ({
    ...point,
    x: (point.x * configuration.width) / configuration.dpr,
    y: (point.y * configuration.height) / configuration.dpr
  }));
}

/** Real premultiplied document layers expose pickup, all-layer sampling, filters and history restoration. */
function previewLayers(
  configuration: PreviewConfiguration,
  id: number,
  brush: ReturnType<typeof preparePreview>['brush']
) {
  const width = Math.ceil(configuration.width / configuration.dpr);
  const height = Math.ceil(configuration.height / configuration.dpr);
  const { background } = configuration;
  const prefix = `preview-${id}`;
  const layerFrom = (pixels: Uint8Array, name: string): Layer => {
    const tiles: Layer['tiles'] = new Map();
    for (let ty = 0; ty * TILE_SIZE < height; ty++) {
      for (let tx = 0; tx * TILE_SIZE < width; tx++) {
        const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
        for (let y = 0; y < Math.min(TILE_SIZE, height - ty * TILE_SIZE); y++) {
          const offset = ((ty * TILE_SIZE + y) * width + tx * TILE_SIZE) * 4;
          tile.set(
            pixels.subarray(offset, offset + Math.min(TILE_SIZE, width - tx * TILE_SIZE) * 4),
            y * TILE_SIZE * 4
          );
        }
        tiles.set(`${tx},${ty}`, tile);
      }
    }
    return { id: `${prefix}-${name}`, name, opacity: 1, visible: true, blend: 'normal', tiles };
  };
  const blank = () => new Uint8Array(width * height * 4);
  const solid = blank();
  const rgb = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16));
  for (let i = 0; i < solid.length; i += 4) {
    solid.set([...rgb, 255], i);
  }
  const paper = layerFrom(solid, 'background');
  const tool = configuration.kind === 'abr' ? configuration.input.values.tool : undefined;
  const nativeEraser = brush.tool === 'eraser';
  const erase = nativeEraser || tool?.type === 'ErTl';
  let layer: Layer;
  let historySource: Layer | undefined;
  const layers = [paper];
  if (erase) {
    const checker = blank();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 224 : 184;
        checker.set([value, value, value, 255], (y * width + x) * 4);
      }
    }
    layers[0] = layerFrom(checker, 'checker');
    layer = layerFrom(tool?.eraseToHistory ? blank() : solid, 'paint');
    historySource = { ...layer, tiles: layerFrom(solid, 'history').tiles };
  } else if (tool && ['MixB', 'SmTl', 'ShTl', 'BlTl'].includes(tool.type)) {
    const fixture = retouchFixture(width, height, 1);
    layers.push(layerFrom(fixture.below, 'below'));
    layer = layerFrom(fixture.layer, 'paint');
  } else {
    layer = { id: `${prefix}-paint`, name: 'Stroke', opacity: 1, visible: true, blend: 'normal', tiles: new Map() };
  }
  layers.push(layer);
  return { layers, layer, historySource };
}
