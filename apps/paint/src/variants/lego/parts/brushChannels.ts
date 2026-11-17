import { curvePosition, curveValue } from '@app-game/abr-brush/sliderCurves';
import { abrCategories } from '../../../features/brush-editor/abrSchema';
import { brushCategories, brushSettingName } from '../../../features/brush-editor/schema';
import type { LegoServices } from '../LegoServices';
import type { ValueChannel } from './values';

/** Stable settings generate channels once; availability and bounds resolve against the live brush. */
export const brushChannels: readonly ValueChannel[] = [brushCategories, abrCategories].flatMap((categories, schema) =>
  categories.flatMap((category) =>
    category.settings.flatMap((setting): ValueChannel[] => {
      if (setting.kind !== 'number') {
        return [];
      }

      // Shared Paint rows in the ABR editor have the same stable IDs and behavior.
      if (schema === 1 && brushCategories.some((c) => c.settings.some((s) => s.id === setting.id))) {
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
          pinOnly: true,
          min: 0,
          minimum: (s) => (active(s) ? setting.min(brush(s)) : 0),
          max: (s) => (active(s) ? setting.max(brush(s)) : 1),
          step: setting.step,
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
          format: (value) => `${setting.format?.(value) ?? Number(value.toFixed(3))}${setting.unit}`
        }
      ];
    })
  )
);
