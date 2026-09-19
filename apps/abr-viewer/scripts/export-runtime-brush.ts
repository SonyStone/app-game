import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { encodeRuntimeBrush } from '@app-game/abr-paint/runtimeBrush';
import { initAbr } from '@app-game/abr-parser';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

/** Author-side conversion. Refuses partially parsed ABRs and never overwrites an existing export. */
const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    brush: { type: 'string' },
    output: { type: 'string' }
  }
});
if (!values.input || !values.brush || !values.output)
  throw new Error('Use --input FILE.abr --brush "Exact preset name" --output FILE.abrbrush');
await initAbr(
  await readFile(new URL('../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);
const file = loadBrushLibrary(await readFile(values.input));
if (file.errors.length) throw new Error(`ABR parsing failed: ${file.errors.join('; ')}`);
const matches = file.brushes.filter((brush) => brush.name === values.brush);
if (matches.length !== 1) throw new Error(`Expected one matching preset; found ${matches.length}.`);
const prepared = prepareAbrBrush(matches[0]!);
const bytes = encodeRuntimeBrush(prepared);
await writeFile(values.output, bytes, { flag: 'wx' });
console.log(`Exported ${prepared.name}: ${bytes.length} bytes, ${prepared.resources.length} coverage resources.`);
console.log('Preserves the current ABR engine inputs. Does not certify undocumented Photoshop behavior.');
