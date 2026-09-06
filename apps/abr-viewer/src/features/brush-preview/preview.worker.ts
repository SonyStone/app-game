import type { BrushTipImage } from '../../lib/abr';
import { renderPreviewPixels } from './cpu';
import { createPreviewGpu } from './gpu';
import { generatePreviewTip } from './physical-tip';
import type { PreviewJob, PreviewReply } from './protocol';
import { decodePreviewResources, type PreviewResources } from './resources';

/** A single serial renderer owns all preview GPU resources. CPU fallback also stays in this worker. */
let gpu: Awaited<ReturnType<typeof createPreviewGpu>> | undefined;
let reason: string | undefined;
const ready = createPreviewGpu()
  .then((value) => {
    gpu = value;
  })
  .catch((error) => {
    reason = String(error);
  });
const cpuCanvas = new OffscreenCanvas(1, 1);
const tips = new Map<string, BrushTipImage>();
let tipBytes = 0;
const resources = new Map<string, PreviewResources>();
let resourceBytes = 0;
const images = new Map<string, { bitmap: ImageBitmap; backend: 'gpu' | 'cpu'; reason?: string }>();
let imageBytes = 0;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<PreviewJob>) => {
  queue = queue
    .then(() => render(event.data))
    .catch((error) => post({ type: 'error', id: event.data.id, message: String(error) }));
};

async function render(job: PreviewJob) {
  await ready;
  const signature = JSON.stringify([
    job.tipKey,
    job.auxKey,
    { ...job.input, values: { ...job.input.values, name: '' } }
  ]);
  const cached = images.get(signature);
  if (cached) {
    images.delete(signature);
    images.set(signature, cached);
    const bitmap = await createImageBitmap(cached.bitmap);
    post({ type: 'image', id: job.id, bitmap, backend: cached.backend, reason: cached.reason }, [bitmap]);
    return;
  }
  let aux = resources.get(job.auxKey ?? '');
  if (!aux && job.resources) {
    aux = decodePreviewResources(job.resources);
    if (aux.dualTip) aux.dualTip = prepareTip(aux.dualTip);
    resources.set(job.auxKey ?? '', aux);
    resourceBytes += (aux.pattern?.data.byteLength ?? 0) + (aux.dualTip?.data.byteLength ?? 0);
    while (resourceBytes > 32 * 1024 * 1024 && resources.size > 1) {
      const [key, old] = resources.entries().next().value!;
      resources.delete(key);
      resourceBytes -= (old.pattern?.data.byteLength ?? 0) + (old.dualTip?.data.byteLength ?? 0);
    }
  }
  if (job.auxKey && !aux) {
    post({ type: 'need-tip', id: job.id });
    return;
  }
  let tip = tips.get(job.tipKey);
  if (!tip && job.tip) tip = prepareTip(job.tip);
  if (!tip && (job.tipKey.startsWith('computed:') || job.tipKey.startsWith('physical:')))
    tip = generatePreviewTip(job.input.values);
  if (tip) {
    if (!tips.has(job.tipKey)) tipBytes += tip.data.byteLength;
    tips.delete(job.tipKey);
    tips.set(job.tipKey, tip);
    while (tipBytes > 16 * 1024 * 1024 && tips.size > 1) {
      const oldest = tips.entries().next().value!;
      tips.delete(oldest[0]);
      tipBytes -= oldest[1].data.byteLength;
    }
  }
  if (!tip && !gpu?.hasTip(job.tipKey)) {
    post({ type: 'need-tip', id: job.id });
    return;
  }
  if (gpu && !job.input.resourcePreview) {
    try {
      const bitmap = await gpu.render(job.input, job.tipKey, tip, aux, job.auxKey);
      await present(job.id, signature, bitmap, 'gpu', aux?.warning);
      return;
    } catch (error) {
      reason = String(error);
      gpu.dispose();
      gpu = undefined;
    }
  }
  if (!tip) {
    post({ type: 'need-tip', id: job.id });
    return;
  }
  cpuCanvas.width = job.input.width;
  cpuCanvas.height = job.input.height;
  const context = cpuCanvas.getContext('2d');
  if (!context) throw new Error('Preview canvas unavailable');
  context.putImageData(
    new ImageData(renderPreviewPixels(job.input, tip, undefined, aux), job.input.width, job.input.height),
    0,
    0
  );
  const bitmap = cpuCanvas.transferToImageBitmap();
  await present(job.id, signature, bitmap, 'cpu', aux?.warning);
}

/** Retained bitmaps are bounded by both count and bytes; transferred clones have a single UI owner. */
async function present(id: number, signature: string, bitmap: ImageBitmap, backend: 'gpu' | 'cpu', warning?: string) {
  const output = await createImageBitmap(bitmap);
  images.set(signature, { bitmap, backend, reason: warning ?? reason });
  imageBytes += bitmap.width * bitmap.height * 4;
  while (images.size > 32 || imageBytes > 16 * 1024 * 1024) {
    const oldest = images.entries().next().value!;
    images.delete(oldest[0]);
    imageBytes -= oldest[1].bitmap.width * oldest[1].bitmap.height * 4;
    oldest[1].bitmap.close();
  }
  post({ type: 'image', id, bitmap: output, backend, reason: warning ?? reason }, [output]);
}

function post(reply: PreviewReply, transfer: Transferable[] = []) {
  self.postMessage(reply, { transfer });
}

/** Preview textures are at most 1024 pixels per side; the original export data remains untouched. */
function prepareTip(tip: BrushTipImage): BrushTipImage {
  const scale = Math.min(1, 1024 / Math.max(tip.width, tip.height));
  const width = Math.max(1, Math.round(tip.width * scale)),
    height = Math.max(1, Math.round(tip.height * scale));
  const data = new Uint8Array(width * height);
  // Parser tip data is already normalized to 8-bit coverage, regardless of its original depth metadata.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const left = (x * tip.width) / width,
        right = ((x + 1) * tip.width) / width;
      const top = (y * tip.height) / height,
        bottom = ((y + 1) * tip.height) / height;
      let sum = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++)
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weight =
            (Math.min(sx + 1, right) - Math.max(sx, left)) * (Math.min(sy + 1, bottom) - Math.max(sy, top));
          sum += tip.data[sy * tip.width + sx]! * weight;
        }
      data[y * width + x] = Math.round(sum / ((right - left) * (bottom - top)));
    }
  return { width, height, data, depth: 8 };
}
