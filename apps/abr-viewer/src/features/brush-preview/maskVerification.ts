import { brushToFormValues } from '@app-game/abr-brush/form';
import { createPreviewGpu } from './gpu';
import type { PreviewInput } from './stroke';
import type { PreviewResources } from './resources';
import { renderPreviewPixels } from './cpu';

/** Checks the live preview's texture lifecycle; Photoshop kernel fixtures establish arithmetic correctness separately. */
export async function verifyMaskPreview() {
  const gpu = await createPreviewGpu();
  const values = brushToFormValues({
    id: 'mask-qa', name: 'Mask QA', type: 'sampled', settings: {}, diameter: 40, spacing: 10
  });
  values.useTransfer = true;
  values.transfer.opacityControl = 2;
  values.transfer.flowControl = 2;
  const input: PreviewInput = {
    values, width: 240, height: 64, dpr: 1, color: '#ffffff', background: '#000000', opacity: 0.5, flow: 0.5
  };
  const tip = { width: 8, height: 8, depth: 8 as const, data: new Uint8Array(64).fill(255) };
  const read = async (job: PreviewInput, resources: PreviewResources = {}) => {
    const bitmap = await gpu.render(job, 'mask-qa', tip, resources, 'mask-qa');
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D verification context unavailable');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    } finally {
      bitmap.close();
    }
  };
  try {
    const first = await read(input);
    const painted = first.filter((value, i) => i % 4 === 0 && value > 0);
    if (painted.length < 100 || painted.some(value => value > 128))
      throw new Error('Preview mask failed to produce ink with the final 50% tool opacity.');
    const dynamic: PreviewInput = { ...input, color: '#e13b72', values: { ...values,
      useColorDynamics: true, colorDynamics: { ...values.colorDynamics, applyPerTip: true, hueJitter: 80 } } };
    const colored = await read(dynamic);
    const distinct = new Set(Array.from({ length: colored.length / 4 }, (_, i) =>
      `${colored[i * 4]},${colored[i * 4 + 1]},${colored[i * 4 + 2]}`));
    if (distinct.size < 20 || colored.some((value, i) => i % 4 !== 3 && value > 128))
      throw new Error('Color Dynamics preview lost color variation or exceeded final tool opacity.');
    await read({ ...input, values: { ...values, diameter: 290 }, width: 320, height: 300 });
    const coloredAgain = await read(dynamic);
    if (colored.some((value, i) => value !== coloredAgain[i]))
      throw new Error('Switching preview mask modes changed Color Dynamics output.');
    const recreated = await read(input);
    if (first.some((value, i) => value !== recreated[i]))
      throw new Error('Recreating preview textures changed the mask output.');
    const secondary: PreviewInput = { ...input, width: 32, height: 32, flow: 1, opacity: 1,
      path: [{ x: 0.5, y: 0.5, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }],
      values: { ...values, diameter: 16, useTransfer: false, useDualBrush: true,
        dualBrush: { ...values.dualBrush, tipId: 'secondary-sampled-qa', diameter: 16, mode: 'Mltp', scatter: 0 } } };
    const dualTip = { ...tip, data: new Uint8Array(64).fill(128) };
    for (const [count, expected] of [[1, 128], [2, 192], [8, 255]] as const) {
      secondary.values.dualBrush.count = count;
      const pixels = await read(secondary, { dualTip });
      if (pixels[(16 * 32 + 16) * 4] !== expected)
        throw new Error(`Viewer affine secondary Count ${count} did not produce coverage ${expected}`);
    }
    secondary.width = 320;
    secondary.values.dualBrush.count = 1;
    secondary.values.dualBrush.spacing = 3;
    secondary.path = [{ ...secondary.path![0]!, x: .05 }, { ...secondary.path![0]!, x: .95, time: 100 }];
    const longStroke = await read(secondary, { dualTip });
    const cpu = renderPreviewPixels(secondary, tip, undefined, { dualTip });
    if (longStroke.some((value, i) => value !== cpu[i]))
      throw new Error('Batched sampled-secondary preview differs from CPU coverage.');
    secondary.values.dualBrush.tipId = '';
    secondary.values.dualBrush.hardness = 40;
    secondary.values.dualBrush.roundness = 35;
    secondary.values.dualBrush.angle = 31;
    const computed = await read(secondary, { dualTip });
    const computedCpu = renderPreviewPixels(secondary, tip, undefined, { dualTip });
    if (computed.some((value, i) => value !== computedCpu[i]))
      throw new Error('Computed-secondary GPU coverage differs from the shared CPU mask.');
    secondary.values.dualBrush.diameter = 29;
    const resizedComputed = await read(secondary, { dualTip });
    if (!resizedComputed.some((value, i) => value !== computed[i]))
      throw new Error('Computed-secondary size change reused a stale GPU texture.');
    secondary.values.dualBrush.diameter = 16;
    const restoredComputed = await read(secondary, { dualTip });
    if (restoredComputed.some((value, i) => value !== computed[i]))
      throw new Error('Computed-secondary cache round-trip changed coverage.');
    return { paintedPixels: painted.length, colorVariants: distinct.size, resizeStable: true,
      modeSwitchStable: true, affineSecondaryCounts: [1, 2, 8], sampledSecondaryBatching: true, computedSecondary: true };
  } finally {
    gpu.dispose();
  }
}
