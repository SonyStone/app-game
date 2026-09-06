import type { BrushTipImage } from '../../lib/abr';
import { brushToFormValues } from '../brush-detail/brush-form-schema';
import { renderPreviewPixels } from './cpu';
import { createPreviewGpu } from './gpu';
import type { PreviewResources } from './resources';
import { generateComputedBrushTip, type PreviewInput } from './stroke';

/** Browser-run pixel comparisons exercise real shaders, including sampled tips and device loss. */
export async function verifyPreviewGpu() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU unavailable: verification cannot pass');
  const device = await adapter.requestDevice();
  const gpu = await createPreviewGpu({ device });
  const values = brushToFormValues({
    id: 'test',
    name: 'Preview test',
    type: 'computed',
    settings: {},
    spacing: 10,
    diameter: 45,
    hardness: 45
  });
  const base: PreviewInput = {
    values,
    width: 320,
    height: 96,
    dpr: 1,
    background: '#333333',
    color: '#ffffff',
    flow: 0.3,
    opacity: 0.7
  };
  const rectangular: BrushTipImage = {
    width: 24,
    height: 9,
    depth: 8,
    data: Uint8Array.from({ length: 24 * 9 }, (_, i) => (i % 24 < 4 ? 255 : Math.round((200 * (i % 24)) / 24)))
  };
  const results: string[] = [];
  try {
    for (const mode of [
      'soft',
      'sampled',
      'rotated',
      'pressure',
      'scatter',
      'texture',
      'texture-stroke',
      'dual',
      'color',
      'pose',
      'wet'
    ]) {
      const input = structuredClone(base);
      const tip = mode === 'soft' ? generateComputedBrushTip(128, 45) : rectangular;
      if (mode === 'rotated') {
        input.values.angle = 67;
        input.values.flipX = true;
        input.values.roundness = 35;
      }
      if (mode === 'pressure') {
        input.values.useShapeDynamics = true;
        input.values.shapeDynamics.sizeControl = 2;
        input.values.useTransfer = true;
        input.values.transfer.opacityControl = 2;
        input.values.transfer.flowControl = 2;
      }
      if (mode === 'scatter') {
        input.values.useScattering = true;
        input.values.scattering.scatter = 150;
        input.values.scattering.count = 3;
        input.values.useShapeDynamics = true;
        input.values.shapeDynamics.angleJitter = 90;
      }
      const resources: PreviewResources = {};
      if (mode.startsWith('texture')) {
        input.values.useTexture = true;
        input.values.texture.eachTip = mode === 'texture';
        input.values.texture.scale = 57;
        input.values.texture.depth = 67;
        input.values.texture.brightness = 17;
        input.values.texture.contrast = 23;
        input.values.texture.mode = 'Mltp';
        resources.pattern = {
          width: 7,
          height: 5,
          depth: 8,
          data: Uint8Array.from({ length: 35 }, (_, i) => (i * 41) % 256)
        };
      }
      if (mode === 'dual') {
        input.values.useDualBrush = true;
        input.values.dualBrush.mode = 'Mltp';
        input.values.dualBrush.diameter = 30;
        resources.dualTip = generateComputedBrushTip(32, 50);
      }
      if (mode === 'color') {
        input.values.useColorDynamics = true;
        input.values.colorDynamics.applyPerTip = true;
        input.values.colorDynamics.hueJitter = 50;
        input.values.colorDynamics.foregroundBackgroundJitter = 70;
        input.color = '#ef6123';
      }
      if (mode === 'pose') {
        input.values.useShapeDynamics = true;
        input.values.shapeDynamics.sizeControl = 2;
        input.values.shapeDynamics.brushProjection = true;
        input.values.useBrushPose = true;
        input.values.brushPose.overridePressure = true;
        input.values.brushPose.pressure = 40;
      }
      if (mode === 'wet') input.values.useWetEdges = true;
      const start = performance.now();
      const bitmap = await gpu.render(input, mode, tip, resources, mode);
      const elapsed = performance.now() - start;
      const canvas = document.createElement('canvas');
      canvas.width = input.width;
      canvas.height = input.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      document.querySelector('#previews')!.append(canvas);
      const actual = context.getImageData(0, 0, input.width, input.height).data;
      const expected = renderPreviewPixels(input, tip, undefined, resources);
      let total = 0,
        worst = 0,
        changed = 0,
        outliers = 0;
      for (let i = 0; i < actual.length; i += 4) {
        const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(actual[i + c]! - expected[i + c]!)));
        total += delta;
        worst = Math.max(worst, delta);
        if (actual[i]! !== 51) changed++;
        if (delta > 8) outliers++;
      }
      const mean = total / (input.width * input.height);
      if (mean > 0.3 || outliers > input.width * input.height * 0.002 || changed < 10)
        throw new Error(`${mode}: mean=${mean}, max=${worst}, outliers=${outliers}, painted=${changed}`);
      const warm = performance.now();
      const repeated = await gpu.render(input, mode, undefined, resources, mode);
      repeated.close();
      results.push(
        `${mode}: PASS, mean error ${mean.toFixed(3)}, max ${worst}, edge outliers ${outliers}, cold ${elapsed.toFixed(1)} ms, cached-tip ${(performance.now() - warm).toFixed(1)} ms`
      );
    }
    device.destroy();
    await device.lost;
    let rejected = false;
    try {
      await gpu.render(base, 'soft');
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Device loss was not reported');
    results.push('Device loss: PASS');
    return results.join('\n');
  } finally {
    gpu.dispose();
  }
}

document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  const report = document.querySelector('#report')!;
  document.querySelector('#previews')!.replaceChildren();
  report.textContent = 'Running';
  try {
    report.textContent = `PASS\n${await verifyPreviewGpu()}`;
  } catch (error) {
    report.textContent = `FAIL\n${String(error)}`;
  }
};
