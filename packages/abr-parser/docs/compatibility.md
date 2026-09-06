# ABR compatibility audit — 2026-09-06

This is a tested compatibility boundary, not a claim that every ABR byte or Photoshop brush behavior is understood.

## Verified evidence

- The 11 repository fixtures contain 123 presets across container versions 6.2, 9.2 and 10.2. All parse without errors. Every preset's typed descriptor survives the default writer/read cycle. Original sample, pattern and hierarchy payloads survive unchanged. See [the reproducible report](compatibility-report.json) for hashes, counts, offsets and whole-file equality results.
- The separately supplied `watercolor.abr` contains 139 sampled presets, is 86,692,615 bytes, and has SHA-256 `1c8cf39bd5126f6cc778c28331631315cb27f17d8391bce35729ec6bfc95ff1c`. Its typed brush descriptors and the three retained resource payloads also pass comparison. Its 83,624,064-byte pattern payload is opaque to this parser.
- Native Photoshop 2025 **26.0.0**, macOS: imported an edited computed preset, an edited watercolor Spatter Spread 2 preset, and a newly generated 8×8 sampled preset. Photoshop's preset count increased from 99 to 102. Saved its brush library through Photoshop, parsed the resulting **10.2** file (102 presets, no errors), and verified both edited spacings remain **58%**, both sampled pixel arrays are identical, and the watercolor preset retains its secondary sample dependency. Temporary presets were removed; the original 99 names and their order were unchanged. This tests import, serialization and selected settings, not painted stroke equivalence.
- Native testing initially rejected exports. It exposed two defects that self-round-trip tests missed: omitted dual-brush sample dependencies and zero-filled VM-array headers for generated samples. Both were corrected and the native test passed afterward.

Local native-test artifacts remain under ignored `test-output/`: `photoshop-qa-input.abr`, `photoshop-qa-output.abr`, `photoshop-qa-log.txt`, and `watercolor-audit.json`. The native output includes the user's pre-existing presets and must not be committed. The temporary validation script was run through Photoshop's File → Scripts → Browse.

## Additional Downloads corpus

All nine `.abr` files found in the supplied Downloads directory passed on 2026-09-06: **948 presets**. The megapack is container 10.2; the others are 6.2. Full-file exports preserve brush counts, typed preset descriptors, and original sample/pattern/hierarchy payloads. Whole-file byte identity is not asserted.

| File | Presets | Full-file audit | Selected export |
| --- | ---: | --- | --- |
| 2.1 Набор кистей. Set of brushes.abr | 9 | Pass | Pass (2 presets) |
| Spring-Brushes-2024.abr | 30 | Pass | Pass (1 presets) |
| dry_media.abr | 35 | Pass | Pass (1 presets) |
| gouache.abr | 41 | Pass | Pass (1 presets) |
| halftones_and_screentones.abr | 135 | Pass | Pass (2 presets) |
| manga.abr | 41 | Pass | Pass (2 presets) |
| megapack.abr | 465 | Pass | Pass (2 presets) |
| spatter_brushes.abr | 53 | Pass | Pass (1 presets) |
| watercolor.abr | 139 | Pass | Pass (1 presets) |

Selected exports cover 13 presets, choosing a sampled preset with the most secondary-tip dependencies and a computed preset where available. They preserve typed settings, decoded tip pixels and secondary sample records. These are parser/writer checks; this additional corpus was not imported into Photoshop or tested for rendering equivalence.

See [the Downloads report](downloads-compatibility-report.json) for source hashes, resource offsets, and comparison results. Original files remain in Downloads; no source ABR files were copied into the repository. Together with the repository corpus, the audited source set is **20 files / 1,071 presets** (watercolor counted once).

## Supported and unverified areas

| Area | Current behavior | Evidence / limit |
| --- | --- | --- |
| Containers | Read versions 6, 9, 10; subversions 1, 2; reject other headers | Real fixtures for 6.2/9.2/10.2; no real subversion-1 fixture |
| Legacy ABR 1/2 | Explicitly unsupported | Requires a separate record parser and legacy fixtures |
| Descriptor values | `long`, `doub`, `bool`, `TEXT`, `enum`, `UntF`, `Objc`, `GlbO`, `VlLs`, `tdta`, `alis`, `comp`, `type`, `GlbC`, `obj ` | Common types occur in real fixtures; uncommon types have synthetic wire tests. `comp` retains its eight bytes; references retain validated encoded payloads |
| Other descriptor encodings | Stop with an offset and error | No guessing the size of unknown encodings such as object arrays |
| Sample pixels | Raw / PackBits, 8/16 bit; signed bounds; bounded channels and rows | Real 8-bit fixtures; synthetic 16-bit coverage; 16-bit source records preserved but preview edits cannot regenerate full precision |
| Sample metadata | Read VM-array framing; retain the original full record; generate the observed 56-channel layout for new 8-bit tips | Native new-tip test passed. Sample prefix semantics, nonempty masks, and all possible layouts are not established |
| Dependencies | Preserve primary and nested `sampledData` records; validate UUID references and conflicts | Native watercolor dual-brush test and synthetic selected-export test |
| Patterns | Preserve encoded `patt` payloads | No structured pattern editing or complete channel/compression decoder |
| Hierarchy | Read/rebuild known group/start/end/preset entries; preserve full original `phry` when supplied | Rebuilt hierarchy cannot promise preservation of unknown hierarchy attributes |
| Extension resources | Expose source offsets and retain unknown block payloads | Their semantics are unknown; canonical output places extension blocks after known blocks |
| Multiple descriptor blocks | Report unsupported editing model | Avoid concatenating independently headed descriptors into a seemingly valid editable file |
| Brush behavior | Retain typed settings beyond UI controls | Bristle, erodible, mixer, texture, blending, pen-input dynamics and other Photoshop rendering semantics are not fully reproduced or exhaustively mapped |

The writer retains typed root and preset class metadata. Canonical rewriting can normalize string encodings, padding, and block layout; typed equality and payload equality are distinct from whole-file byte equality. Arbitrary combination of files with unmodeled root/extension metadata remains unverified. The editor refuses mixed sample subversions rather than converting opaque records.

## Sample byte map

Offsets below are relative to a **subversion-2 sample payload**, after its four-byte record length. They describe the common single grayscale-channel layout in the corpus. The reader walks declared channel counts and lengths instead of assuming these offsets for all files.

| Offset | Bytes | Meaning / confidence |
| --- | ---: | --- |
| 0 | 1 | Identifier byte count (36) |
| 1 | 36 | Full sample UUID, matched to descriptor `sampledData` |
| 37 | 1 | Zero terminator |
| 38 | 3 | Observed prefix `01 00 00`; complete semantics unverified |
| 41 | 4 | VM-array-list version (3) |
| 45 | 4 | Length of VM-array-list payload |
| 49 | 16 | Outer rectangle: signed top, left, bottom, right |
| 65 | 4 | Channel count (56 in this layout) |
| 69 | 220 | 55 unwritten-channel flags (four-byte zero each) |
| 289 | 4 | Grayscale channel written flag (1) |
| 293 | 4 | Channel payload length |
| 297 | 4 | Channel depth |
| 301 | 16 | Channel rectangle |
| 317 | 2 | Repeated channel depth |
| 319 | 1 | ABR sample compression: 0 raw, 1 PackBits |
| 320 | variable | Pixels; PackBits begins with one 16-bit encoded-byte count per row |
| after pixels | 8 | Two unwritten mask flags in the observed layout |

Each sample record is padded to four bytes. Resource framing is `8BIM`, four-byte key, four-byte payload length, then payload. Some original files add null alignment padding between resources. The audit reports every recognized resource's absolute offset, length, and remaining padding bytes; it does **not** mislabel the entire payload as semantically understood.

## Repeatable validation

From the repository root:

```sh
pnpm --filter @app-game/abr-parser test
pnpm --filter @app-game/abr-parser typecheck
pnpm --filter @app-game/abr-viewer test
pnpm --filter @app-game/abr-viewer typecheck
pnpm exec tsx packages/abr-parser/scripts/audit.ts
pnpm exec tsx packages/abr-parser/scripts/audit.ts /absolute/path/to/another.abr
```

Before expanding support, add an original Photoshop fixture and a native import/export check. For setting semantics, export controlled preset pairs differing in only one option, compare typed descriptors and binary ranges, and validate actual strokes under defined pressure/tilt inputs. Unknown bytes need documented evidence or explicit preservation; passing a self-round-trip is insufficient.

## Sources

- [Adobe Photoshop File Formats Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/) documents descriptors and Virtual Memory Array Lists, but is not a complete modern ABR specification. Its pattern-compression table must not be substituted blindly for ABR's observed compression values.
- [GIMP's brush loader](https://github.com/GNOME/gimp/blob/master/app/core/gimpbrush-load.c) provides independent container and sample-offset evidence for versions 6/10 and subversions 1/2; this project's version-9 evidence comes from its fixture.
- [Adobe's brush import/export workflow](https://helpx.adobe.com/photoshop/desktop/apply-painting-techniques/brushes-presets/import-brushes-brush-packs.html) describes importing packs and exporting selected brushes.
