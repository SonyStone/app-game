import { record } from '@app-game/abr-brush/form';
import type { Brush } from '@app-game/paint-core/brush';

/**
 * Whether strokes of `brush` erase rather than paint: Paint's eraser (`tool: 'eraser'`), an ABR brush in the Clear
 * mode, as the eraser makes of a brush it erases with (`clearAbrBrush`), and a Photoshop Eraser Tool preset. A preview
 * of such a brush needs paint under it to show anything.
 */
export function brushErases(brush: Pick<Brush, 'tool' | 'engine'>) {
  if (brush.tool === 'eraser') {
    return true;
  }

  if (brush.engine?.id !== 'abr') {
    return false;
  }

  const settings = record(brush.engine.settings);
  const tool = record(record(settings.values).tool);
  return settings.blendMode === 'Cler' || tool.type === 'ErTl' || tool.mode === 'Cler';
}
