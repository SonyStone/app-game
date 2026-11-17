import { abrCategories } from './abrSchema';
import { brushCategories, type BrushCategory, type BrushSetting } from './schema';

/** Shortest unambiguous board caption across Paint and ABR, counting shared IDs once. */
export function brushSettingName(category: BrushCategory, setting: BrushSetting): string {
  const rows = [
    ...new Map(
      [brushCategories, abrCategories].flatMap((categories) =>
        categories.flatMap((c) => c.settings.filter((s) => s.kind === 'number').map((s) => [s.id, { c, s }] as const))
      )
    ).values()
  ];
  const phrase = (section: string | undefined, label: string) =>
    section ? `${section} ${label.toLowerCase()}` : label;
  const own = brushCategories.flatMap((c) => c.settings).find((s) => s.id === setting.id);
  if (own || rows.filter(({ s }) => s.label === setting.label).length === 1) {
    return own?.label ?? setting.label;
  }

  const name = phrase(setting.section, setting.label);
  if (rows.filter(({ s }) => phrase(s.section, s.label) === name).length === 1) {
    return name;
  }

  return phrase(category.label, name);
}
