import { initAbr } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
await initAbr(
  readFileSync(resolve(import.meta.dirname, '../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm'))
);
