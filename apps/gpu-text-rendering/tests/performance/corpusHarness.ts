import { layoutPages } from '../../src/features/document/document';
import { readGdoc } from '../../src/features/document/format/readGdoc';
import { createFrame } from '../../src/features/document/rendering/createFrame';
import { createTypeGpuRenderer } from '../../src/features/document/rendering/createTypeGpuRenderer';
import { mountRenderingGpu } from '../browser/renderingHarness';

/** Loads one external document and measures navigation with at most one outstanding frame. */
export async function prepareCorpusNavigation(url: string) {
  const data = (await readGdoc(await (await fetch(url)).arrayBuffer()))._unsafeUnwrap();
  const document = {
    ...data,
    pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
    images: new Map(),
    imageVertices: new ArrayBuffer(0)
  };
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.round(innerWidth * devicePixelRatio);
  canvas.height = Math.round(innerHeight * devicePixelRatio);
  window.document.body.append(canvas);

  const { gpu, dispose } = await mountRenderingGpu(
    canvas,
    document.kind === 'curves'
      ? Math.max(document.instances.byteLength, document.curves.byteLength)
      : document.glyphVertices.byteLength
  );
  const errors: string[] = [];
  gpu.device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const prepared = await createTypeGpuRenderer(gpu, document);
  if (prepared.isErr()) {
    throw new Error(JSON.stringify(prepared.error));
  }
  const renderer = prepared.value;
  const first = document.pages[0]!;
  const right = Math.max(...document.pages.map((page) => -page.x + page.width / first.width));
  const bottom = Math.min(...document.pages.map((page) => 1 - page.y - page.height / first.height));
  const overview = {
    x: right / 2,
    y: (1 + bottom) / 2,
    zoom: Math.max((right * innerHeight) / innerWidth, ((1 - bottom) * first.height) / first.width) * 0.65,
    rotation: 0
  };
  const camera = { ...overview };
  const frame = () => createFrame(document, camera, canvas.width, canvas.height);

  async function draw() {
    const start = performance.now();
    renderer.render(frame())._unsafeUnwrap();
    const cpu = performance.now() - start;
    await gpu.device.queue.onSubmittedWorkDone();
    return { cpu, completed: performance.now() - start };
  }

  function focus(index: number) {
    const page = document.pages[index]!;
    return { x: -page.x + page.width / first.width / 2, y: 1 - page.y - page.height / first.height / 2 };
  }

  function detailFocus(index: number) {
    const page = document.pages[index]!;
    if (document.kind !== 'curves') {
      return focus(index);
    }
    const records = new DataView(document.instances);
    const curves = new Float32Array(document.curves);
    const first = Math.floor((page.beginVertex + page.endVertex) / 12);
    for (let instance = first; instance < page.endVertex / 6; instance++) {
      const offset = instance * 80;
      if (records.getUint32(offset + 72, true) > 1 || records.getUint32(offset + 68, true) < 12) {
        continue;
      }
      const curve = records.getUint32(offset + 64, true) * 8;
      const x = curves[curve]!;
      const y = curves[curve + 1]!;
      return {
        x:
          -page.x +
          records.getFloat32(offset + 16, true) +
          records.getFloat32(offset, true) * x +
          records.getFloat32(offset + 8, true) * y,
        y:
          1 -
          page.y -
          records.getFloat32(offset + 20, true) -
          records.getFloat32(offset + 4, true) * x -
          records.getFloat32(offset + 12, true) * y
      };
    }
    return focus(index);
  }

  return {
    pages: document.pages.length,
    width: canvas.width,
    height: canvas.height,
    async measure(name: string, zoom: number, count = 45) {
      const page = Math.floor(document.pages.length / 2);
      const center =
        name.startsWith('overview') || name === 'far'
          ? overview
          : name === 'letter' || name === 'zoom-cycle'
            ? detailFocus(page)
            : focus(page);
      const cpu: number[] = [];
      const completed: number[] = [];
      const intervals: number[] = [];
      let previous: number | undefined;

      for (let index = 0; index < count; index++) {
        const now = await new Promise<number>(requestAnimationFrame);
        if (previous !== undefined) {
          intervals.push(now - previous);
        }
        previous = now;
        const progress = name === 'zoom-cycle' ? Math.sin((Math.PI * index) / (count - 1)) ** 2 : 1;
        camera.zoom = name === 'zoom-cycle' ? overview.zoom * Math.exp(Math.log(0.0001) * progress) : zoom;
        camera.x = overview.x + (center.x - overview.x) * progress + Math.sin(index / 8) * camera.zoom * 0.1;
        camera.y = overview.y + (center.y - overview.y) * progress;
        camera.rotation = name === 'rotate' ? ((index / count) * Math.PI) / 2 : 0;
        if (index % 15 === 0) {
          console.log(`NAV ${name} frame ${index}`);
        }
        const result = await draw();
        cpu.push(result.cpu);
        completed.push(result.completed);
      }

      return {
        name,
        zoom,
        frames: count,
        visiblePages: frame().visible.length,
        cpuMs: stats(cpu),
        completedMs: stats(completed),
        frameIntervalMs: stats(intervals),
        completedFramesPerSecond: 1000 / stats(intervals).mean,
        resourceBytes: renderer.resourceBytes,
        refinement: renderer.refinement,
        errors: [...errors]
      };
    },
    /** Each page is visited at reading scale, so testing the first page cannot hide a bad interior page. */
    async visit(index: number) {
      Object.assign(camera, focus(index), { zoom: 0.65, rotation: 0 });
      return { page: index + 1, ...(await draw()) };
    },
    overviewZoom: overview.zoom,
    async screenshot() {
      await gpu.device.queue.onSubmittedWorkDone();
      renderer.render(frame())._unsafeUnwrap();
      return canvas.toDataURL();
    },
    destroy() {
      renderer.destroy();
      dispose();
    }
  };
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)]!,
    p95: sorted[Math.floor(sorted.length * 0.95)]!,
    max: sorted.at(-1)!,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length
  };
}
