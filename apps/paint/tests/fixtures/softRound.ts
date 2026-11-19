import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { percent, pixels } from '@app-game/abr-parser';
import { defaultBrush } from '@app-game/paint-core/brush';

/** Prepared, test-only equivalent of Paint's Soft round, including its zero-pressure diameter floor. */
export function softRoundCandidate(size = 32, erase = false, flow = 0.35) {
  const preset = prepareAbrBrush({
    id: 'soft-round-reference',
    name: 'Soft round reference',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{ toolOptions: { kind: erase ? 'ErTl' : 'PbTl', flow: flow * 100, opacity: 100 } },
      tip: { kind: 'computed', diameter: pixels(size), hardness: percent(65), spacing: percent(12) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
  });
  const values = preset.engine.settings.values;
  values.useSmoothing = false;
  values.useShapeDynamics = true;
  values.shapeDynamics.sizeControl = 2;
  values.shapeDynamics.minimumDiameter = 4;
  return {
    ...preset,
    brush: {
      ...defaultBrush(),
      engine: preset.engine,
      size,
      flow,
      color: '#000000',
      tool: erase ? ('eraser' as const) : ('brush' as const)
    }
  };
}
