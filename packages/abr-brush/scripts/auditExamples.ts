import { AbrParser } from '@app-game/abr-parser/reader';
import { readFileSync, readdirSync } from 'node:fs';
import { brushFormSchema, brushToFormValues, brushToolSettings } from '../src/form';
import { paintModes } from '../src/paintBlend';

/** Audits preset/schema coverage without claiming rendered equivalence or modifying the examples. */
function auditExamples() {
  const directory = new URL('../../../apps/abr-viewer/src/assets/examples/', import.meta.url);
  let total = 0;
  for (const name of readdirSync(directory).filter((name) => name.endsWith('.abr'))) {
    const file = new AbrParser().parse(readFileSync(new URL(name, directory)));
    const kinds: Record<string, number> = {},
      modes: Record<string, number> = {},
      colors: Record<string, number> = {};
    const failures: { name: string; reason: string }[] = [];
    for (const brush of file.brushes) {
      const values = brushToFormValues(brush),
        result = brushFormSchema.safeParse(values),
        tool = brushToolSettings(brush);
      kinds[values.tipKind] = (kinds[values.tipKind] ?? 0) + 1;
      modes[tool.blendMode] = (modes[tool.blendMode] ?? 0) + 1;
      const rawTool = brush.settings.toolOptions;
      if (rawTool && typeof rawTool === 'object' && !Array.isArray(rawTool)) {
        for (const [key, value] of Object.entries(rawTool)) {
          if (!['FrgC', 'BckC'].includes(key) || !value || typeof value !== 'object') continue;
          const model = '__classId' in value ? String(value.__classId) : 'untyped';
          colors[model] = (colors[model] ?? 0) + 1;
        }
      }
      if (!result.success) failures.push({ name: brush.name, reason: result.error.message });
      if (!paintModes.some((mode) => mode === tool.blendMode))
        failures.push({ name: brush.name, reason: `Unknown mode ${tool.blendMode}` });
    }
    total += file.brushes.length;
    console.log(JSON.stringify({ name, brushes: file.brushes.length, kinds, modes, colors, failures }));
    if (failures.length) process.exitCode = 1;
  }
  console.log(`${total} presets audited. Rendering parity requires separate reference tests.`);
}
auditExamples();
