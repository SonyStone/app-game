import { record } from '@app-game/abr-brush/form';
import { createAbrStroke } from '@app-game/abr-paint/engine';
import { studioProcessors } from '../strokeProcessors';
import { abrBrush } from './abrBrushEngine';
import { createAbrProcessor } from './abrStrokeProcessor';
import type { PaintModules } from './contracts';
import { plainRoundRoute, roundAbrSelection } from './resolveRoundBrush';
import { roundBrush } from './roundBrushEngine';

/**
 * Studio's stroke processors and brush engines: the part of its recipe that decides how a brush draws. Shared by the
 * canvas (`StudioApplication`) and by brush previews, such as the pressure calibration's test canvas, so that a
 * preview draws the current brush exactly as the canvas does.
 */
export const studioBrushRecipe = {
  processors: { ...studioProcessors, abr: createAbrProcessor },
  // Photoshop placement retains the preset smoother. Paint distance uses the stroke mode's processor.
  selectProcessor: (brush) =>
    brush.engine?.id === 'abr' &&
    record(brush.engine.settings).placement !== 'paint-distance-v1' &&
    brush.stroke.mode !== 'none' &&
    brush.stroke.mode !== 'stabilizer'
      ? 'abr'
      : brush.stroke.mode,
  engines: {
    [roundBrush.id]: drawRound,
    eraser: drawRound,
    [abrBrush.id]: abrBrush.engine
  },
  selectEngine: (brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')
} satisfies Pick<PaintModules, 'processors' | 'selectProcessor' | 'engines' | 'selectEngine'>;

/** Tool slots and preview workers can receive a live round brush without its source document. */
export function drawRound(context: Parameters<typeof roundBrush.engine>[0], route: 'abr' | 'round' = plainRoundRoute) {
  if (route === 'round' || !context.renderer.supportsPaintRound) {
    return roundBrush.engine(context);
  }

  const engine = roundAbrSelection(context.brush);
  // Host round controls produced these settings locally. Transported ABR presets still decode at their entry.
  return createAbrStroke({
    ...context,
    brush: { ...context.brush, engine },
    settings: engine.settings,
    modifiers: undefined
  });
}
