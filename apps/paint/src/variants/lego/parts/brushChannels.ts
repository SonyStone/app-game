import { curvePosition, curveValue } from '@app-game/abr-brush/sliderCurves';
import { brushSettingName } from '../../../features/brush-editor/brushSettingName';
import { brushCategories, numberSettings } from '../../../features/brush-editor/schema';
import type { LegoServices } from '../LegoServices';
import { unitSuffix } from './ValueEntry';
import type { ValueChannel } from './values';

/**
 * The kind of the value part for the brush setting `id`: Size and Opacity reuse the board's own parts, every other
 * number setting has the part its channel below defines.
 */
export function brushSettingKind(id: string) {
  return id === 'size' || id === 'opacity' ? `value:${id}` : `value:brush:${id}`;
}

/**
 * A part for every number row of the brush studio's one registry, generated once; availability, bounds and values
 * resolve against the brush's document as the studio reads it (`brushEditor.view`), and edits go through the same
 * editor, so a part on the board and its row in the studio always agree. Size and Opacity are the board's own parts.
 */
export const brushChannels: readonly ValueChannel[] = brushCategories.flatMap((category) =>
  numberSettings(category.settings).flatMap((setting): ValueChannel[] => {
    if (setting.id === 'size' || setting.id === 'opacity') {
      return [];
    }

    const view = (s: LegoServices) => s.brushEditor.view();
    const active = (s: LegoServices) => {
      const current = view(s);
      return !!current && category.applies(current) && setting.applies(current) && setting.enabled(current);
    };
    return [
      {
        id: `brush:${setting.id}`,
        group: 'brush-values',
        label: brushSettingName(category, setting),
        short: brushSettingName(category, setting),
        unit: setting.unit,
        colored: false,
        studioOnly: true,
        min: 0,
        minimum: (s) => (active(s) ? setting.min(view(s)!) : 0),
        max: (s) => (active(s) ? setting.max(view(s)!) : 1),
        step: setting.step,
        levels: setting.levels,
        active,
        read: (s) => (active(s) ? setting.read(view(s)!) : 0),
        write: (s, value) => {
          if (!active(s)) {
            return;
          }

          const current = view(s)!;
          const next = setting.write(current, value);
          if (next !== current.text) {
            return s.brushEditor.update(next);
          }
        },
        toFraction: (value, max, s) => {
          const curve = active(s) ? setting.curve?.(view(s)!) : undefined;
          const min = active(s) ? setting.min(view(s)!) : 0;
          return curve ? curvePosition(curve, value) : (value - min) / (max - min || 1);
        },
        fromFraction: (fraction, max, s) => {
          const curve = active(s) ? setting.curve?.(view(s)!) : undefined;
          const min = active(s) ? setting.min(view(s)!) : 0;
          return curve ? curveValue(curve, fraction) : min + fraction * (max - min);
        },
        format: (value) => `${setting.format?.(value) ?? Number(value.toFixed(3))}${unitSuffix(setting.unit)}`
      }
    ];
  })
);
