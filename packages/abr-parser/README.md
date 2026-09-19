# ABR parser

Two independent ABR codecs with one TypeScript interface:

- **JavaScript** is the default. Its binary reader, writer, field projection and image decoders run without WASM.
- **Rust/WASM** implements the same operations in `photoshop-analysis/abr-rs`.

Both load lazily. Importing the entry point loads only the small facade and branded-number helpers. `loadAbr` imports and initializes the selected implementation; concurrent calls share initialization, and a failed attempt can retry.

```ts
import { loadAbr } from '@app-game/abr-parser';

const abr = await loadAbr('js'); // Change to 'wasm' to select Rust.
const document = abr.parseAbr(await file.arrayBuffer());
if (document.brushes[0]?.tip) document.brushes[0].tip.hardness = abr.percent(45);
const bytes = abr.writeAbr(document);
```

You can also keep named imports. `/js`, `/browser`, `/reader` and the root select JavaScript; `/wasm-parser` selects Rust. Operations are synchronous after initialization.

```ts
import { initAbr, parseAbr } from '@app-game/abr-parser/wasm-parser';
await initAbr();
const document = parseAbr(await file.arrayBuffer());
```

Initialize separately in each worker. Browser WASM initialization fetches the adjacent binary; Node callers supply its bytes:

```ts
import { readFile } from 'node:fs/promises';
import { loadAbr } from '@app-game/abr-parser';
const abr = await loadAbr('wasm', await readFile(new URL(import.meta.resolve('@app-game/abr-parser/wasm'))));
```

The `/wasm` export is the binary asset, retained for existing imports. The JS implementation accepts the same optional initialization parameter and ignores it. Type-only imports from `/types` load no code.

## Shared contract

| Operation | Result |
| --- | --- |
| `parseAbr(bytes)` | Readable brushes, hierarchy, resource index, extensions and owned original source bytes |
| `writeAbr(document)` | Supported field edits; an unchanged document retains exact original bytes |
| `readLibrary(bytes, budget?)` | Parse once, resolve references and decode primary images once per resource |
| `resolveResources(resources, brush)` | Resolve current sample, dual sample and pattern references |
| `resourceSource(document, resource)` | Independent compressed sample or pattern source |
| `decodeResource(source, budget?)` | 8-bit coverage image with original `sourceDepth` |
| `readPlane(document, resource, slot)` | Native decoded storage bytes, depth and bounds |
| `sampleBytes(document, resource)` / `readSamplePlane(bytes, layout)` | Standalone sample inspection |
| `createAbr(brushes)` | Create a computed brush set from scratch |
| `composeAbr({sources, brushes, hierarchy})` | Explicit selection, ordering, duplication and folder reconstruction |

`AbrParser` is the common **type**, not the retired constructor. Both backends consume the same portable objects: a document parsed by one can be edited, written or composed by the other. They throw on unsupported edits instead of dropping information. Error wording for malformed binary input is backend-specific; callers should catch exceptions rather than inspect their text.

Readable keys (`tip.hardness`, `roundness`, `toolOptions.opacity`) and branded `Percent`, `Degrees`, `Pixels` types come from one researched catalog. Save the whole document, including `source`, for lossless writing. Unknown fields, original encodings, padding and opaque sections survive through extensions/source. `BigInt` and `Uint8Array` require structured storage; plain JSON is insufficient.

The modern codec covers container majors 6–11, sample layouts 1/2, 22 descriptor value tags, VMAL planes and raw/PackBits images, including 1/8/16/32-bit normalization. Historical ABR 1/2 and Photoshop-equivalent brush rendering are outside this interface. CMYK/Lab pattern previews require profile conversion and are rejected by both decoders.

`parseAbr` indexes resources without expanding pixels. Code loading and image decoding are separate decisions: use `readLibrary` for prepared primary masks, or `decodeResource` on demand. Vite emits separate JS and WASM runtime chunks. Paint's service worker caches these chunks after first use, excluding them from precaching.

UI-specific IDs, display names and image ownership are assembled by `@app-game/abr-brush/library`. Viewer continues using its `current-rust-v3` IndexedDB key because the portable document shape is unchanged; the older `current` checkpoint remains intact.

## Development

```sh
pnpm --filter @app-game/abr-parser sync:wasm
pnpm --filter @app-game/abr-parser typecheck
pnpm --filter @app-game/abr-parser test
pnpm exec tsx packages/abr-parser/scripts/parity.ts
pnpm exec tsx packages/abr-brush/tests/rust-parity.ts
```

Build `photoshop-analysis/abr-wasm` before syncing. The sync script copies the WASM artifact, regenerates the JS field dictionary from the same schema, and copies the small researched fixtures. Manifests record their hashes. Package tests do not require the research checkout.

`src/js/` is the independent modern codec. `tests/reference/` retains the old implementation only as a test oracle. Differential tests cover portable objects, cross-backend writes, authored fields, composition, images, budgets, corruptions and ownership. Browser tests verify actual lazy network loading and JS operation without a WASM request.

Research: [Rust crate](../../../photoshop-analysis/abr-rs/README.md), [WASM API](../../../photoshop-analysis/abr-wasm/README.md). Target: Photoshop 26.
