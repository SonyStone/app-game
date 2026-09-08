import { isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import type { BrushFormValues } from './brush-form-schema';

/** Native tool availability, shared by the options bar and the extended settings panel. */
export function toolOptionVisible(tool: BrushFormValues['tool'], key: string): boolean {
  const type = tool.type;
  if (isBlockEraser(tool) && ['opacity', 'flow', 'pressureOverridesOpacity', 'pressureOverridesSize'].includes(key))
    return false;
  if (type === 'ErTl' && key === 'mode') return false;
  if (usesPencilCoverage(tool) && key === 'flow') return false;
  if (
    ['SmTl', 'ShTl', 'BlTl'].includes(type) &&
    ['opacity', 'flow', 'pressureOverridesOpacity', 'legacy'].includes(key)
  )
    return false;
  if (type === 'MixB' && ['mode', 'opacity', 'pressureOverridesOpacity', 'legacy'].includes(key)) return false;
  if (['wetness', 'load', 'mix', 'autoFill', 'autoClean', 'loadSolidColorOnly', 'sampleAllLayers'].includes(key))
    return type === 'MixB';
  if (['fingerPainting', 'smudgeAllLayers'].includes(key)) return type === 'SmTl';
  if (key === 'sharpenAllLayers') return ['ShTl', 'BlTl'].includes(type);
  if (key === 'protectDetail') return type === 'ShTl';
  if (key === 'strength') return ['SmTl', 'ShTl', 'BlTl'].includes(type);
  if (key === 'autoErase') return type === 'PcTl';
  if (['eraseToHistory', 'eraserMode'].includes(key)) return type === 'ErTl';
  return true;
}

/** Fields placed in Photoshop order in the always-visible options bar. */
export const toolbarToolFields = [
  'type',
  'mode',
  'eraserMode',
  'opacity',
  'pressureOverridesOpacity',
  'strength',
  'wetness',
  'load',
  'mix',
  'flow',
  'pressureOverridesSize'
] as const satisfies readonly (keyof BrushFormValues['tool'])[];
