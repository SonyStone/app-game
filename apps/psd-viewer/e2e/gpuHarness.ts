import { writePsd } from '@app-game/psd';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import tgpu from 'typegpu';
import { displayTiles, type DisplayTile } from '../src/features/gpu-viewport/displayTiles';
import { makeGpuDisplay } from '../src/features/gpu-viewport/makeGpuDisplay';

/** Browser-only readback fixture: strict CPU composition supplies the expected straight RGBA samples. */
export async function runReadbacks(dpr: number) {
  const width = 1027;
  const height = 517;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.set(
        [(x * 17 + y) % 256, (y * 31 + x) % 256, (x + y * 7) % 256, x % 11 === 0 ? 0 : (x + y) % 3 === 0 ? 127 : 255],
        (y * width + x) * 4
      );
    }
  }

  const bytes = await writePsd(
    {
      width,
      height,
      layers: [
        {
          name: 'RGBA and seams',
          left: 0,
          top: 0,
          width,
          height,
          pixels,
          opacity: 1,
          visible: true,
          blend: 'normal',
          clipping: false,
          transparencyLocked: false
        }
      ]
    },
    pixels
  );
  const opened = await openPsd(bytes);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  const rendered = opened.value.render({ ...photoshopDefaultSettings, approximate: false });
  if (!rendered.ok) {
    throw new Error(rendered.error.message);
  }

  const image = rendered.value;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU adapter required for the readback suite');
  }

  const device = await adapter.requestDevice({
    requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : []
  });
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
  const root = tgpu.initFromDevice({ device });
  const display = makeGpuDisplay({ root, device, format: 'rgba8unorm' });
  const w = 1103;
  const h = 601;
  const target = device.createTexture({
    size: [w, h],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });
  const stride = Math.ceil((w * 4) / 256) * 256;
  const read = device.createBuffer({ size: stride * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const results = [];
  try {
    const regions: DisplayTile[] = [];
    for (let top = 0; top < height; top += 512) {
      for (let left = 0; left < width; left += 512) {
        const clip = { left, top, width: Math.min(512, width - left), height: Math.min(512, height - top) };
        const x = Math.max(0, left - 1);
        const y = Math.max(0, top - 1);
        const result = opened.value.renderRegion(
          {
            left: x,
            top: y,
            width: Math.min(width, left + clip.width + 1) - x,
            height: Math.min(height, top + clip.height + 1) - y
          },
          { ...photoshopDefaultSettings, approximate: false }
        );
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        regions.push({ image: result.value, left: x, top: y, step: 1, clip });
      }
    }

    for (const [source, tiles] of [
      ['whole chunks', displayTiles(image)],
      ['worker regions', regions]
    ] as const) {
      display.setTiles(tiles);
      for (const scenario of [
        { name: '100%', scale: 1, x: 0, y: 0, raw: true },
        { name: 'nearest 400%', scale: 4, x: -1903 / dpr, y: -1800 / dpr, raw: true },
        { name: 'opaque 100%', scale: 1, x: 0, y: 0, raw: false },
        { name: 'fractional filtered', scale: 0.37 / dpr, x: 1.25, y: 2.75, raw: false }
      ]) {
        let pending = true;
        while (pending) {
          pending = display.draw(scenario, w, h, dpr, target.createView(), scenario.raw);
          if (pending) {
            await new Promise(requestAnimationFrame);
          }
        }

        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
          { texture: target },
          { buffer: read, bytesPerRow: stride },
          { width: w, height: h }
        );
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const actual = new Uint8Array(read.getMappedRange());
        let differences = 0;
        let max = 0;
        let first: unknown;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const px = (x + 0.5 - scenario.x * dpr) / (scenario.scale * dpr);
            const py = (y + 0.5 - scenario.y * dpr) / (scenario.scale * dpr);
            const background =
              (Math.floor((x + 0.5) / (8 * dpr)) + Math.floor((y + 0.5) / (8 * dpr))) % 2 === 0 ? 60 : 48;
            let expected = scenario.raw ? [0, 0, 0, 0] : [background, background, background, 255];
            if (px >= 0 && py >= 0 && px < width && py < height) {
              if (scenario.raw) {
                const offset = (Math.floor(py) * width + Math.floor(px)) * 4;
                expected = [...image.pixels.subarray(offset, offset + 4)];
              } else {
                const color = [0, 0, 0, 0];
                const filtered = scenario.scale * dpr < 1;
                const bx = filtered ? Math.floor(px - 0.5) : Math.floor(px);
                const by = filtered ? Math.floor(py - 0.5) : Math.floor(py);
                const fx = filtered ? px - 0.5 - bx : 0;
                const fy = filtered ? py - 0.5 - by : 0;
                for (let dy = 0; dy < 2; dy++) {
                  for (let dx = 0; dx < 2; dx++) {
                    const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
                    const offset =
                      (Math.max(0, Math.min(height - 1, by + dy)) * width + Math.max(0, Math.min(width - 1, bx + dx))) *
                      4;
                    const alpha = image.pixels[offset + 3] / 255;
                    for (let channel = 0; channel < 3; channel++) {
                      color[channel] += image.pixels[offset + channel] * alpha * weight;
                    }

                    color[3] += alpha * weight;
                  }
                }

                expected = [...color.slice(0, 3).map((value) => Math.round(value + background * (1 - color[3]))), 255];
              }
            }

            for (let channel = 0; channel < 4; channel++) {
              const delta = Math.abs(actual[y * stride + x * 4 + channel] - expected[channel]);
              max = Math.max(max, delta);
              if (delta > (scenario.raw ? 0 : 1)) {
                differences++;
                first ??= { x, y, channel, actual: actual[y * stride + x * 4 + channel], expected: expected[channel] };
              }
            }
          }
        }

        read.unmap();
        results.push({ name: scenario.name, source, dpr, differences, max, first });
      }
    }

    await device.queue.onSubmittedWorkDone();
    return { results, errors, timestampQueries: device.features.has('timestamp-query') };
  } finally {
    display.destroy();
    target.destroy();
    read.destroy();
    root.destroy();
    device.destroy();
    image.dispose();
    opened.value.close();
  }
}
