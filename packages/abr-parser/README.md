# ABR parser

Workspace package for reading and writing Adobe Photoshop brush files.

- Browser code imports `@app-game/abr-parser/browser` and uses `AbrParser.parse` / `AbrWriter.write` with byte buffers.
- Node code imports `@app-game/abr-parser`; these classes also support `parseFile` and `writeFile`.
- Run `pnpm --filter @app-game/abr-parser test`, `typecheck`, or `build` from the repository root.
- `files/` contains the 11 original brush files and the binary pattern definition.
- `fixtures/original-roundtrip/` preserves 12 original output files. Tests write new results into ignored `test-output/`.
- `docs/` contains format research, brush settings, and documentation imported from disassembly-lab.

The source repository remains at `/home/driver/projects/disassembly-lab`, including its original Git history and uncommitted work. Existing app-game solid-dnd and solid-nest packages were reused, not replaced by their older copies.
