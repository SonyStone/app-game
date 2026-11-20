import type { BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush } from '@app-game/paint-core/brush';
import { assetId } from '@app-game/paint-core/paintbrush/asset';
import { prepareDocument } from '../../src/features/brush-library/abrPresetDocument';

import { pressureBinding } from '../../src/features/brush-library/nativeDocument';

/** Resolves the same sampled-tip document for the GPU, main-thread and worker verifications. */
export async function sampledFixture(
  image: BrushResource = { id: 'square', width: 2, height: 2, format: 'r8unorm', pixels: new Uint8Array(4).fill(255) },
  angleDeg = 0,
  brush = defaultBrush()
) {
  const sha256 = await assetId(image);
  const document = {
    id: image.id,
    name: image.id,
    resources: { tip: { format: 'r8', width: image.width, height: image.height, sha256 } },
    definition: {
      tool: brush.tool,
      size: brush.size,
      tips: { tip: { kind: 'sampled', resource: 'tip', angleDeg } },
      sequence: { order: 'cycle', tips: ['tip'] },
      placement: { law: 'paint-distance-v1', spacing: 0.04 },
      transfer: { flow: brush.flow, opacity: brush.opacity },
      dynamics: [
        ...(brush.pressureSize ? [pressureBinding('/size')] : []),
        ...(brush.pressureFlow ? [pressureBinding('/transfer/flow')] : [])
      ]
    }
  };
  const { preset, resources } = await prepareDocument(JSON.stringify(document), new Map([[sha256, image]]));
  return { brush: { ...brush, ...preset.settings }, resource: resources[0]! };
}
