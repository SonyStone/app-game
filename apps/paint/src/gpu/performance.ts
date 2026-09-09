import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { createPaintRenderer } from './renderer';

/** Repeatable large-viewport workload on an isolated device/document. Counts actual CPU texture uploads. */
export async function measurePainting(
  report: (message: string) => void,
  options: { dense?: boolean; fullRedraw?: boolean } = {}
) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU unavailable');
  const device = await adapter.requestDevice();
  let uploadBytes = 0;
  let textureCount = 0;
  const writeTexture = device.queue.writeTexture.bind(device.queue);
  device.queue.writeTexture = (destination, data, layout, size) => {
    uploadBytes += data.byteLength;
    Reflect.apply(writeTexture, device.queue, [destination, data, layout, size]);
  };
  const createTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor) => {
    textureCount++;
    return createTexture(descriptor);
  };
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(1, 1), (error) => errors.push(error), { device });
  const document = createDocument();
  if (options.dense) {
    const pixels = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([90, 110, 120, 255], i);
    for (let x = -7; x < 7; x++) for (let y = -7; y < 7; y++) document.active.tiles.set(`${x},${y}`, pixels);
  }
  document.changeLayer({ type: 'add' });
  const camera = { ...defaultCamera(), zoom: options.dense ? 0.25 : 1 };
  const brush = { ...defaultBrush(), pressureSize: false };
  const size = { width: 1200, height: 1800 };
  const frames: number[] = [];
  const finishes: number[] = [];
  try {
    // Warm shaders before collecting times.
    renderer.begin(document.active, brush);
    await renderer.paint([{ x: 0, y: 0, radius: 16, flow: 0.35 }]);
    document.commit(await renderer.finish());
    await renderer.render(document.layers, camera, size, 2);
    await device.queue.onSubmittedWorkDone();
    uploadBytes = textureCount = 0;
    for (let stroke = 0; stroke < 60; stroke++) {
      renderer.begin(document.active, brush);
      const x = -400 + (stroke % 12) * 64;
      await renderer.paint(
        Array.from({ length: 140 }, (_, i) => ({
          x: x + Math.sin(i / 20) * 40,
          y: -600 + i * 8,
          radius: 16,
          flow: 0.35
        }))
      );
      const start = performance.now();
      if (options.fullRedraw) renderer.invalidateView();
      await renderer.render(document.layers, camera, size, 2);
      frames.push(performance.now() - start);
      const finish = performance.now();
      document.commit(await renderer.finish());
      finishes.push(performance.now() - finish);
      if ((stroke + 1) % 20 === 0) report(`Completed ${stroke + 1}/60 strokes`);
    }
    await device.queue.onSubmittedWorkDone();
    if (errors.length) throw new Error(errors.join('\n'));
    const mean = (values: number[]) => (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)]!.toFixed(2);
    report(
      JSON.stringify(
        {
          viewportPixels: 8_388_608,
          mode: options.fullRedraw ? 'full redraw' : 'incremental',
          strokes: 60,
          documentTiles: document.state().tileCount,
          cpuTextureUploadMiB: +(uploadBytes / 1024 / 1024).toFixed(2),
          texturesCreated: textureCount,
          renderCpuMeanMs: mean(frames),
          renderCpuP95Ms: p95(frames),
          finishMeanMs: mean(finishes),
          finishP95Ms: p95(finishes),
          firstTenRenderMs: mean(frames.slice(0, 10)),
          lastTenRenderMs: mean(frames.slice(-10))
        },
        null,
        2
      )
    );
  } finally {
    renderer.destroy();
    device.destroy();
  }
}

/** Same over-budget document/workload, comparing a forced full redraw with dirty-region rendering. */
export async function measureDensePainting(report: (message: string) => void) {
  report('Full redraw of a document larger than the tile cache:');
  await measurePainting(report, { dense: true, fullRedraw: true });
  report('Same document with incremental viewport updates:');
  await measurePainting(report, { dense: true });
}

/** Camera-only workload, including GPU completion, on a document larger than the paint cache. */
export async function measureNavigation(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU unavailable');
  const device = await adapter.requestDevice();
  let uploads = 0,
    allocations = 0;
  const write = device.queue.writeTexture.bind(device.queue);
  device.queue.writeTexture = (...args) => {
    uploads += args[1].byteLength;
    Reflect.apply(write, device.queue, args);
  };
  const create = device.createTexture.bind(device);
  device.createTexture = (descriptor) => {
    allocations++;
    return create(descriptor);
  };
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(1, 1), (error) => errors.push(error), { device });
  const document = createDocument();
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([90, 110, 120, 255], i);
  for (let x = -7; x < 7; x++) for (let y = -7; y < 7; y++) document.active.tiles.set(`${x},${y}`, pixels);
  const size = { width: 1200, height: 1800 };
  try {
    await renderer.render(document.layers, { ...defaultCamera(), zoom: 0.22 }, size, 2);
    await device.queue.onSubmittedWorkDone();
    uploads = allocations = 0;
    const cpu: number[] = [],
      completed: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const start = performance.now();
      await renderer.render(
        document.layers,
        {
          ...defaultCamera(),
          x: Math.sin(frame / 10) * 200,
          y: Math.cos(frame / 10) * 150,
          zoom: 0.22 + Math.sin(frame / 15) * 0.03,
          angle: Math.sin(frame / 20) * 0.1
        },
        size,
        2
      );
      cpu.push(performance.now() - start);
      await device.queue.onSubmittedWorkDone();
      completed.push(performance.now() - start);
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const mean = (values: number[]) => +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    report(
      JSON.stringify(
        {
          frames: 60,
          tiles: 196,
          uploadMiB: uploads / 1024 / 1024,
          allocations,
          cpuMeanMs: mean(cpu),
          completedMeanMs: mean(completed),
          completedP95Ms: +completed.sort((a, b) => a - b)[57]!.toFixed(2)
        },
        null,
        2
      )
    );
  } finally {
    renderer.destroy();
    device.destroy();
  }
}
