# Photoshop settings audit — 2026-09-07

The typed descriptor reader agrees with Photoshop 26.0.0 on the available modern ABR corpus:
**20 files, 1,071 presets, 129,716 typed values, zero differences**. This verifies decoding of the
settings present in those files. It does not prove every Photoshop control is represented by our
convenience API, every historical ABR format is supported, or our renderer applies each setting correctly.

## Independent native check

Each ABR's `desc` resource, including its descriptor-version prefix, was passed directly to Photoshop's
`ActionDescriptor.fromStream`. The [native readback script](../scripts/photoshop-descriptor-readback.jsx)
then walked Photoshop's typed getters. No preset import, tool change, painting, or document modification
was needed. Our reader's output was compared against that independent result.

The comparison covered every key, list position, type, nested class ID, enum type/value, unit,
string, integer, boolean, double, and raw-data byte present in the descriptor trees. It includes
inactive settings and saved tool options. Descriptor class *names* are excluded: native getters
expose class IDs, not that additional envelope label. No ID aliases needed normalization in this corpus.

ExtendScript rounds decimal output even with `toPrecision(17)`. Doubles were therefore compared
using sign, binary exponent, and the full 53-bit significand split into two integers. The initial
apparent decimal differences disappeared under this exact representation. The six `tdta` payloads
were compared byte for byte as hexadecimal, not merely by size.

| Wire type | Values checked |
| --- | ---: |
| Unit double (`UntF`) | 38,626 |
| Boolean | 33,095 |
| Integer (`long`) | 28,775 |
| Object (`Objc`) | 19,309 |
| Text | 5,593 |
| Enum | 2,457 |
| Double (`doub`) | 1,835 |
| List | 20 |
| Raw data (`tdta`) | 6 |

The corpus is the 11 repository libraries (123 presets) and nine local download libraries
(948 presets), covering ABR 6.2, 9.2, and 10.2. The primary tip classes are 205 `computedBrush`,
854 `sampledBrush`, six `dBrush`, and six `dTips`.

[The committed oracle](../fixtures/photoshop-readback.json) contains source hashes and independently
computed native descriptor hashes for all 20 files, without brush assets or preset contents.
[The regression test](../tests/photoshop-readback.test.ts) checks the 11 available repository libraries
against those native hashes. It never generates its expectations through `AbrWriter`.

## Confirmed problems and corrections

The exported `descriptor-keys.ts` vocabulary contained numerous guessed keys and incorrect nesting.
The generic reader never used this dictionary as an allowlist, so these mistakes did not discard
settings from parsed descriptors. No current runtime consumer imports these maps within this repository.
The corrected maps describe keys at their actual containing-object level:

| Setting | Correct wire location |
| --- | --- |
| Spacing enabled | `Brsh.Intr` (previously mislabeled interpolation) |
| Size dynamics | `szVr.{bVTy,fStp,jitter,"Mnm "}` |
| Angle / roundness dynamics | `angleDynamics` / `roundnessDynamics` |
| Scatter / count | `scatterDynamics` / `"Cnt "` / `countDynamics` |
| Pattern / invert / Texture Each Tip | `Txtr` / `InvT` / `TxtC` |
| Texture minimum / dynamics | `minimumDepth` / `textureDepthDynamics` |
| Dual brush enable / mode / flip | `dualBrush.useDualBrush` / `.BlnM` / `.Flip` |
| Secondary tip geometry | `dualBrush.Brsh` |
| Color dynamics | `clVr`, `"H   "`, `Strt`, `Brgh`, `purity`, `colorDynamicsPerTip` |
| Opacity / flow / wetness / mix dynamics | `opVr` / `prVr` / `wtVr` / `mxVr` |
| Pose | `brushPoseTiltX/Y`, `brushPoseAngle`, `brushPosePressure`, `overridePose*` |
| Noise / wet edges / build-up | `Nose` / `Wtdg` / `"Rpt "` |
| Modern smoothing | `toolOptions.smoothing` and accompanying options |

`bVTy` is an integer selector, not a `strokeDynamics*` enum. The reference now documents the
observed format's controls 0–8 and a shared `DynamicsKeys` dictionary. The blend-mode map now includes
`Hght` (Height). The dictionary remains partial: keys not listed there still parse normally.
These corrections change exported dictionary keys/types, so external code using the old guessed
properties must migrate. Historical imported guides may still contain those old examples; use the
current source dictionary for wire paths.

Wire locations are corroborated by the independent
[ag-psd ABR implementation](https://github.com/Agamnentzar/ag-psd/blob/master/src/abr.ts).
The earlier local Photoshop brush probes also established that `TxtC` controls Texture Each Tip;
Photoshop's unrelated-looking string-ID alias is `textClickPoint`. Native descriptor equality alone
is not a behavioral proof for every UI label or control selector.

## Remaining API limits

- `Brush.descriptor` is the full typed settings representation. Preserve it when editing/exporting.
- `Brush.settings` is intentionally lossy: `tdta` becomes `<binary data: N bytes>`; `alis`, `comp`,
  reference, and class values become `null`. The original data remains in `descriptor` and is retained
  by the writer. Six erodible height-map payloads in this corpus require the typed representation.
- `Brush.type` is a legacy two-way category. It labels the 12 bristle/erodible presets `computed`.
  Their actual classes remain in `descriptor.Brsh.classId` and `settings.Brsh.__classId`.
  This label must not be interpreted as “ordinary round brush.”
- `Brush.dynamics` is an optional legacy schema that the parser does not populate. Read dynamics
  through the nested objects in `settings` or `descriptor`.
- `includeRawSettings: false` disables both settings representations. Convenience scalars alone
  are insufficient for reproducing a preset.
- The corpus contains none of the supported opaque alias/reference/64-bit/class types, nor `GlbO`.
  Existing binary-format tests cover these, but this native comparison does not certify them.
  Legacy ABR 1/2 and unknown descriptor wire types remain unsupported.
- Pattern resources and sample pixels are outside this descriptor-only native comparison. See the
  [container compatibility audit](compatibility.md) for separate resource and round-trip checks.

The API documentation now makes these limits explicit. The parser's decoding behavior and the
legacy classification were not changed by this audit.

## Evidence and reproduction

Local full outputs remain in ignored `test-output/native-descriptor-audit/`: `manifest.json`,
`*.bin`, `*.native.json`, `native-report.json`, `inventory.json`, and `comparison.json`.
The local `test-output/prepare-native-audit.ts` extracts payloads and the local
`test-output/native-descriptor-audit/compare.ts` performs the full 20-file comparison.
These local files include preset contents and are deliberately not committed.

To use the committed native reader, create the manifest described in its header, set the Photoshop
ExtendScript global `ABR_AUDIT_DIRECTORY` to that directory, then evaluate the script. Only use a
locally generated manifest: ExtendScript reads it with `eval` because this host has no built-in JSON parser.
Do not regenerate oracle hashes from our own parser output.

Validation after the corrections: **205 tests passed in 12 files**, including 11 native-oracle checks;
`pnpm --filter @app-game/abr-parser typecheck` passed.
