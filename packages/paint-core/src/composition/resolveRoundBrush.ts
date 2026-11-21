import { brushToFormValues } from '@app-game/abr-brush/form';
import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import type { Brush } from '../brush';
import { roundSettings } from './roundBrushEngine';

/**
 * The renderer that draws plain round brushes when a stroke begins (`drawRound` in the studio recipe: the canvas, the
 * drawing pad, calibration and the preview worker): `'abr'` is the ABR engine with Paint's placement and analytic
 * round coverage, `'round'` the native round engine. Both give the same pixels (`softRoundComparison`); set `'round'`
 * to go back. The brush itself stays a round selection either way, so nothing that reads it changes.
 */
export const plainRoundRoute: 'round' | 'abr' = 'abr';

/**
 * The brush `route` draws a plain round brush with: itself for `'round'`, its ABR selection for `'abr'`. Resolve after
 * host controls have been applied, so partial presets inherit the live pressure and tip settings.
 */
export function resolveRoundBrush(brush: Brush, route: 'round' | 'abr'): Brush {
  if (route === 'round') {
    return brush;
  }

  return { ...brush, engine: structuredClone(roundAbrSelection(brush)) };
}

/** Builds validated round overrides into an ABR selection without preparing a computed mask. */
export function roundAbrSelection(brush: Brush) {
  const overrides = brush.engine ? roundSettings.parse(brush.engine.settings) : {};
  const spacing = overrides.spacing ?? brush.spacing;
  const hardness = overrides.hardness ?? brush.hardness;
  const eraser = brush.tool === 'eraser';
  const values = {
    ...defaults,
    diameter: brush.size,
    spacing: spacing * 100,
    hardness: hardness * 100,
    useShapeDynamics: brush.pressureSize,
    shapeDynamics: { ...defaults.shapeDynamics, sizeControl: 2, minimumDiameter: 4 },
    useTransfer: brush.pressureFlow,
    transfer: { ...defaults.transfer, flowControl: brush.pressureFlow ? 2 : 0 },
    tool: { ...defaults.tool, type: eraser ? 'ErTl' : 'PbTl', flow: brush.flow * 100, opacity: brush.opacity * 100 }
  };
  const settings: AbrBrushSettings = {
    placement: 'paint-distance-v1',
    coverage: 'paint-round-v1',
    values,
    tipId: 'paint-analytic-round',
    blendMode: eraser ? 'Cler' : 'Nrml',
    secondaryColor: brush.backgroundColor ?? '#ffffff'
  };
  return { id: 'abr' as const, settings };
}

const defaults = brushToFormValues({ name: 'Paint round', preset: { kind: 'brush', sourceId: 'paint-round' } });
