import { loadBrushLibrary, type BrushAsset } from '@app-game/abr-brush/library';
import { composeAbr, createAbr, degrees, initAbr, percent, pixels, writeAbr } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { initAbr as initRawWasm } from '../../../packages/abr-parser/wasm/dist/index.js';
import { Archive } from '../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm.js';
await initRawWasm(
  readFileSync(new URL('../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);

await initAbr();

/** Authors independently specified native fields, then exercises the public parser. */
export function fixtureWithFields(fields: Record<string, unknown>): BrushAsset {
  const doc = createAbr([
    {
      name: 'Fixture',
      tip: {
        kind: 'computed',
        diameter: pixels(30),
        hardness: percent(100),
        roundness: percent(100),
        spacing: percent(25),
        angle: degrees(0),
        spacingEnabled: true
      }
    }
  ]);
  const [section, entry, item] = doc.brushes[0]!.sourceId.split('/').map(Number);
  const archive = new Archive(writeAbr(doc));
  try {
    const bytes = archive.patch(
      Object.entries(fields).map(([key, value]) => ({
        section,
        path: [{ Entry: entry }, { Item: item }],
        action: { Append: { key: identifier(key), value } }
      }))
    );
    return loadBrushLibrary(bytes).brushes[0]!;
  } finally {
    archive.free();
  }
}
/** Explicit native Objc fixture. Tag spellings are intentional test input, not a runtime adapter. */
export function nativeObject(classId: string, fields: Record<string, unknown>): unknown {
  return {
    Object: {
      class: { name: { units: [0] }, id: identifier(classId) },
      entries: Object.entries(fields).map(([key, value]) => ({ key: identifier(key), value }))
    }
  };
}
/** Exports current fields through Rust composition and reads the result. */
export function roundTripBrush(brush: BrushAsset): BrushAsset {
  return loadBrushLibrary(
    composeAbr({
      sources: [brush.source],
      brushes: [{ source: 0, preset: brush.preset }],
      hierarchy: [{ kind: 'preset' }]
    })
  ).brushes[0]!;
}
function identifier(id: string): unknown {
  const bytes = Array.from(id, (c) => c.charCodeAt(0));
  return id.length === 4 && id !== 'flow' ? { FourCc: bytes } : { String: { bytes: Uint8Array.from(bytes) } };
}
