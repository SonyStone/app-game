import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createAbrProcessor } from '@app-game/paint-core/composition/abrStrokeProcessor';
import type { PaintModules } from '@app-game/paint-core/composition/contracts';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { texturedBrush } from '@app-game/paint-core/composition/texturedBrushEngine';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';

/**
 * Studio's stroke processors and brush engines: the part of its recipe that decides how a brush draws. Shared by the
 * canvas (`StudioApplication`) and by brush previews, such as the pressure calibration's test canvas, so that a
 * preview draws the current brush exactly as the canvas does.
 */
export const studioBrushRecipe = {
  processors: { ...studioProcessors, abr: createAbrProcessor },
  // ABR presets smooth as their preset says unless the stroke is raw or uses the stabilizer.
  selectProcessor: (brush) =>
    brush.engine?.id === 'abr' && brush.stroke.mode !== 'none' && brush.stroke.mode !== 'stabilizer'
      ? 'abr'
      : brush.stroke.mode,
  engines: {
    [roundBrush.id]: roundBrush.engine,
    eraser: roundBrush.engine,
    [texturedBrush.id]: texturedBrush.engine,
    [abrBrush.id]: abrBrush.engine
  },
  selectEngine: (brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')
} satisfies Pick<PaintModules, 'processors' | 'selectProcessor' | 'engines' | 'selectEngine'>;
