import { prepareAbrBrush } from '@app-game/abr-paint/preset';

import { initAbr } from '@app-game/abr-parser';

await initAbr();

/** A prepared ABR preset with one opaque sample for preset upload and engine replacement tests. */
export function sampledPreset() {
  return prepareAbrBrush({
    id: 'ink',
    name: 'Ink',
    preset: { kind: 'brush', sourceId: 'ink', tip: { kind: 'sampled' } },
    tipImage: { width: 1, height: 1, depth: 8, sourceDepth: 8, data: Uint8Array.of(255) },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  });
}
