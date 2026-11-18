import { curvePosition, curveValue } from '@app-game/abr-brush/sliderCurves';
import { abrCategories } from '../../../features/brush-editor/abrSchema';
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
 * Stable settings generate channels once; availability and bounds resolve against the live brush. A curve's three
 * numbers have a channel each, which its part edits through (see `parts/pressureCurve`).
 */
export const brushChannels: readonly ValueChannel[] = [brushCategories, abrCategories].flatMap((categories, schema) =>
  categories.flatMap((category) =>
    numberSettings(category.settings).flatMap((setting): ValueChannel[] => {
      if (setting.id === 'size' || setting.id === 'opacity') {
        return [];
      }

      // Shared Paint rows in the ABR editor have the same stable IDs and behavior.
      if (schema === 1 && brushCategories.some((c) => numberSettings(c.settings).some((s) => s.id === setting.id))) {
        return [];
      }

      const brush = (s: LegoServices) => s.brushEditor.channelBrush();
      const resolved = (s: LegoServices) =>
        schema === 1 ? (s.brushEditor.categories()?.find((c) => c.id === category.id) ?? category) : category;
      const active = (s: LegoServices) =>
        (schema === 0 || brush(s).engine?.id === 'abr') &&
        resolved(s).applies(brush(s)) &&
        setting.applies(brush(s)) &&
        (resolved(s).settings.find((row) => row.id === setting.id) ?? setting).enabled(brush(s));
      return [
        {
          id: `brush:${setting.id}`,
          label: brushSettingName(category, setting),
          short: brushSettingName(category, setting),
          unit: setting.unit,
          colored: false,
          studioOnly: true,
          min: 0,
          minimum: (s) => (active(s) ? setting.min(brush(s)) : 0),
          max: (s) => (active(s) ? setting.max(brush(s)) : 1),
          step: setting.step,
          levels: setting.levels,
          active,
          read: (s) => (active(s) ? setting.read(brush(s)) : 0),
          write: (s, value) => {
            if (active(s)) {
              return s.brushEditor.update(setting.write(brush(s), value));
            }
          },
          toFraction: (value, max, s) => {
            const curve = active(s) ? setting.curve?.(brush(s)) : undefined;
            const min = active(s) ? setting.min(brush(s)) : 0;
            return curve ? curvePosition(curve, value) : (value - min) / (max - min || 1);
          },
          fromFraction: (fraction, max, s) => {
            const curve = active(s) ? setting.curve?.(brush(s)) : undefined;
            const min = active(s) ? setting.min(brush(s)) : 0;
            return curve ? curveValue(curve, fraction) : min + fraction * (max - min);
          },
          format: (value) => `${setting.format?.(value) ?? Number(value.toFixed(3))}${unitSuffix(setting.unit)}`
        }
      ];
    })
  )
);
