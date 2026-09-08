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
      'mixing-linear',
      'mixing-classic',
      'mixing-linear-pencil',
      'mixing-linear-multiply',
      'airbrush-hold',
      'airbrush-smooth',
      'airbrush-slack',
      'pencil',
      'pencil-auto-erase',
      'eraser-brush',
      'eraser-pencil',
      'eraser-block',
      'eraser-history-brush',
      'eraser-history-pencil',
      'eraser-history-block',
      'blur-smooth',
      'blur-smooth-all-layers',
      'sharpen-smooth',
      'smudge-smooth',
      'smudge-smooth-all-layers',
      'smudge-smooth-finger',
      'blur',
      'blur-all-layers',
      'blur-darken',
      'blur-lighten',
      'sharpen',
      'sharpen-protect',
      'mixer-dry',
      'mixer-wet',
      'mixer-all-layers',
      'mixer-depleted',
      'mixer-dynamics',
      'smudge',
      'smudge-all-layers',
      'smudge-finger',
      'smudge-darken',
      'smudge-lighten',
      'sampled',
      'rotated',
      'pressure',
      'pressure-override',
      'scatter',
      'texture',
      'texture-stroke',
      'texture-height',
      'texture-linear-height',
      'texture-height-dual',
      'dual',
      'dual-hard-mix-flow',
      'dual-hard-mix-opacity',
      'color',
      'pose',
      'paint-multiply',
      'paint-screen',
      'paint-hue',
      'wet'
    ]) {
      const input = structuredClone(base);
      if (mode.includes('smooth') && !mode.startsWith('airbrush')) input.colorMixing = 'linear';
      const tip = mode === 'soft' ? generateComputedBrushTip(128, 45) : rectangular;
      if (mode.startsWith('mixing-')) {
        input.colorMixing = mode === 'mixing-classic' ? 'classic' : 'linear';
        input.color = '#ff0000';
        input.background = '#00ff00';
        input.flow = 1;
        input.opacity = 0.5;
        if (mode.endsWith('pencil')) input.values.tool.type = 'PcTl';
        if (mode.endsWith('multiply')) input.values.tool.mode = 'Mltp';
      }
      if (mode.startsWith('mixer')) {
        Object.assign(input.values.tool, {
          type: 'MixB',
          wetness: mode === 'mixer-dry' ? 0 : 75,
          mix: 65,
          load: mode === 'mixer-depleted' ? 1 : 100,
          sampleAllLayers: mode.endsWith('all-layers')
        });
        input.values.spacing = 65;
        input.color = '#e36b21';
        input.flow = 0.8;
      }
      if (mode === 'mixer-dynamics') {
        input.values.useTransfer = true;
        input.values.transfer.wetnessControl = 2;
        input.values.transfer.mixControl = 2;
      }
      if (mode.startsWith('smudge')) {
        input.values.tool.type = 'SmTl';
        input.values.tool.strength = 75;
        input.values.tool.smudgeAllLayers = mode.endsWith('all-layers');
        input.values.tool.fingerPainting = mode.endsWith('finger');
        input.values.tool.mode = mode.endsWith('darken') ? 'Drkn' : mode.endsWith('lighten') ? 'Lghn' : 'Nrml';
        input.values.spacing = 35;
        input.color = '#e36b21';
      }
      if (mode.startsWith('blur') || mode.startsWith('sharpen')) {
        input.values.tool.type = mode.startsWith('blur') ? 'BlTl' : 'ShTl';
        input.values.tool.strength = 75;
        input.values.tool.protectDetail = mode.endsWith('protect');
        input.values.tool.sharpenAllLayers = mode.endsWith('all-layers');
        input.values.tool.mode = mode.endsWith('darken') ? 'Drkn' : mode.endsWith('lighten') ? 'Lghn' : 'Nrml';
        input.values.spacing = 35;
      }
      if (mode.startsWith('airbrush')) {
        input.values.useBuildUp = true;
        input.values.smoothing.amount = mode === 'airbrush-hold' ? 0 : 100;
        input.values.smoothing.pulledString = mode === 'airbrush-slack';
        input.flow = 0.05;
        input.opacity = 0.5;
        input.path = [0, 60, 120, 600].map((time) => ({
          x: 0.5,
          y: 0.5,
          time,
          pressure: 0.7,
          tiltX: 0,
          tiltY: 0,
          rotation: 0
        }));
      }
      if (mode.startsWith('eraser-')) {
        input.values.tool.type = 'ErTl';
        input.values.tool.eraserMode = mode.endsWith('block') ? 3 : mode.endsWith('pencil') ? 2 : 1;
        input.values.tool.eraseToHistory = mode.includes('history');
        // A dormant paint mode must not dissolve an eraser's coverage.
        input.values.tool.mode = 'Dslv';
        input.flow = 0.2;
        input.opacity = 0.25;
        input.background = '#204060';
        if (mode.includes('history')) input.dpr = 2;
      }
      if (mode.startsWith('pencil')) {
        input.values.tool.type = 'PcTl';
        input.values.tool.autoErase = mode === 'pencil-auto-erase';
        input.flow = 0.01;
        input.opacity = 0.25;
        input.color = input.values.tool.autoErase ? input.background : '#ffffff';
        input.secondaryColor = '#e3a020';
      }
      if (mode.startsWith('paint-')) {
        input.values.tool.mode = mode === 'paint-multiply' ? 'Mltp' : mode === 'paint-screen' ? 'Scrn' : 'H   ';
        input.color = '#e36b21';
        input.background = '#325b74';
      }
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
      if (mode === 'pressure-override') {
        input.values.useShapeDynamics = true;
        input.values.shapeDynamics.sizeControl = 3;
        input.values.shapeDynamics.minimumDiameter = 80;
        input.values.shapeDynamics.sizeJitter = 80;
        input.values.tool.pressureOverridesSize = true;
        input.values.useTransfer = true;
        input.values.transfer.opacityControl = 3;
        input.values.transfer.opacityJitter = 80;
        input.values.transfer.opacityMinimum = 80;
        input.values.tool.pressureOverridesOpacity = true;
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
        input.values.texture.eachTip = mode !== 'texture-stroke';
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
      if (mode.includes('height')) {
        input.values.texture.mode = mode === 'texture-linear-height' ? 'linearHeight' : 'Hght';
        input.values.texture.depth = 9;
        input.values.texture.depthControl = 2;
        input.values.spacing = 1;
      }
      if (mode === 'dual' || mode === 'texture-height-dual' || mode.startsWith('dual-hard-mix')) {
        input.values.useDualBrush = true;
        input.values.dualBrush.mode = mode === 'dual' ? 'Mltp' : 'hardMix';
        input.values.dualBrush.diameter = 30;
        resources.dualTip = generateComputedBrushTip(32, 50);
        if (mode.startsWith('dual-hard-mix')) {
          input.values.useTransfer = true;
          input.values.transfer.flowControl = mode.endsWith('flow') ? 2 : 0;
          input.values.transfer.opacityControl = mode.endsWith('opacity') ? 2 : 0;
          input.opacity = mode.endsWith('opacity') ? 0.25 : 1;
        }
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
        if ([0, 1, 2].some((c) => actual[i + c] !== parseInt(input.background.slice(1 + c * 2, 3 + c * 2), 16)))
          changed++;
        if (delta > 8) outliers++;
      }
      const mean = total / (input.width * input.height);
      const incorrectCoverage = mode === 'airbrush-slack' ? changed !== 0 : changed < 10;
      if (mean > 0.3 || outliers > input.width * input.height * 0.002 || incorrectCoverage)
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
