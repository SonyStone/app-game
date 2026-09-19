import { initAbr } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
await initAbr(readFileSync(new URL('../../abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
