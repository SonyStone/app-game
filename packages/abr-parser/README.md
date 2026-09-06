# ABR parser

Workspace package for reading and writing Adobe Photoshop brush files.

- Browser code imports `@app-game/abr-parser/browser` and uses `AbrParser.parse` / `AbrWriter.write` with byte buffers.
- Node code imports `@app-game/abr-parser`; these classes also support `parseFile` and `writeFile`.
- Run `pnpm --filter @app-game/abr-parser test`, `typecheck`, or `build` from the repository root.
- `files/` contains the 11 original brush files and the binary pattern definition.
- `fixtures/original-roundtrip/` preserves 12 original output files. Tests write new results into ignored `test-output/`.
- `docs/` contains format research, brush settings, and documentation imported from disassembly-lab.

The source repository remains at `/home/driver/projects/disassembly-lab`, including its original Git history and uncommitted work. Existing app-game solid-dnd and solid-nest packages were reused, not replaced by their older copies.

## Compatibility

Read [the compatibility audit](docs/compatibility.md) before treating this as a complete ABR implementation.
The parser supports modern containers 6, 9 and 10 with sample layouts 1 and 2; legacy ABR 1/2 is unsupported.
Parsing and resource preservation do not establish identical Photoshop brush rendering.

The audit command records source hashes, block offsets, descriptor types and round-trip comparisons:

```sh
pnpm exec tsx packages/abr-parser/scripts/audit.ts
pnpm exec tsx packages/abr-parser/scripts/audit.ts /absolute/path/to/brushes.abr
```

`AbrFile.errors` must be empty before export. Unknown descriptor types, missing sample dependencies,
and malformed bounded records produce errors rather than silently skipping bytes. The default reader
can recover other framed records; `continueOnError: false` stops at the first failure and still returns
an `AbrFile` with errors. Unknown resource blocks are retained in `resourceBlocks` without claiming
that their contents or relationships are understood.

Keep each brush's `descriptor`, `sampleDependencies`, and tip `sourceSample` when editing or selecting
brushes. These retain descriptor wire types, nested tip references, original sample metadata and 16-bit
precision. `brushTip.data` is always an 8-bit preview even when its source `depth` is 16. Clearing
`rawSampleData` requests selected/regenerated sample output; unchanged records and dependencies are
preserved automatically. Changed 16-bit pixels cannot be exported from the 8-bit preview.

The writer defaults to the source container version and subversion. Explicit subversion conversion
of preserved metadata is rejected. `preserveRawDescriptor` ignores descriptor edits, and
`rawHierarchyData` takes precedence over `hierarchy`; clear the latter raw field to rebuild groups.
