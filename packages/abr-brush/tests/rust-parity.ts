import { decodeResource } from '@app-game/abr-parser';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { composeAbr, initAbr, parseAbr, writeAbr } from '../../abr-parser/src/index';
import { AbrParser } from '../../abr-parser/tests/reference/abr-parser';
import { decodePattern, readPatternIndex } from '../../abr-parser/tests/reference/pattern-reader';
import { brushToFormValues, formValuesToBrush } from '../src/form';
import { loadBrushLibrary } from '../src/library';
import { brushToFormValues as reference } from './reference-form';
await initAbr(readFileSync(new URL('../../abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
const directory = new URL('../../../apps/abr-viewer/src/assets/examples/', import.meta.url);
let count = 0,
  images = 0,
  patterns = 0;
for (const file of readdirSync(directory).filter((f) => f.endsWith('.abr'))) {
  const bytes = readFileSync(new URL(file, directory));
  const old = new AbrParser().parse(bytes),
    modern = loadBrushLibrary(bytes);
  assert.equal(modern.brushes.length, old.brushes.length, file);
  for (const [i, brush] of modern.brushes.entries()) {
    assert.deepEqual(brushToFormValues(brush), reference(old.brushes[i]!), `${file}: ${brush.name}`);
    if (old.brushes[i]!.brushTip) {
      assert.deepEqual(brush.tipImage?.data, old.brushes[i]!.brushTip!.data, `${file}: primary ${brush.name}`);
      images++;
    }
    count++;
  }
  if (old.rawPatternData) {
    const encoded = readPatternIndex(old.rawPatternData);
    const modernPatterns = modern.brushes[0]?.resources.filter((r) => r.resource.kind === 'pattern') ?? [];
    assert.equal(modernPatterns.length, encoded.length, file);
    for (const [index, pattern] of encoded.entries()) {
      assert.deepEqual(
        decodeResource(modernPatterns[index]!.source).data,
        decodePattern(pattern).data,
        `${file}: pattern ${pattern.name}`
      );
      patterns++;
    }
  }
  const first = modern.brushes[0];
  if (first) {
    const edited = formValuesToBrush(first, { ...brushToFormValues(first), name: 'Renamed' });
    const doc = parseAbr(first.source.bytes);
    doc.brushes[0] = edited.preset;
    assert.equal(parseAbr(writeAbr(doc)).brushes[0]?.name, 'Renamed');
    const selected = parseAbr(
      composeAbr({
        sources: modern.sources,
        brushes: [{ source: 0, preset: edited.preset }],
        hierarchy: [{ kind: 'preset' }]
      })
    );
    assert.equal(selected.brushes.length, 1);
    assert.equal(selected.brushes[0]?.name, 'Renamed');
  }
}
console.log(
  JSON.stringify({ brushes: count, images, patterns, forms: 'equal', editing: 'passed', composition: 'passed' })
);
