import fs from 'fs-extra';
import { homedir } from 'os';
import path from 'path';
import which from 'which';

export function findWasmPack() {
    // https://github.com/wasm-tool/wasm-pack-plugin/issues/58
    if (process.env['WASM_PACK_PATH'] !== undefined) {
        return process.env['WASM_PACK_PATH']
    }

    const inPath = which.sync('wasm-pack', { nothrow: true })
    if (inPath) {
        return inPath
    }

    const inCargo = path.join(homedir(), '.cargo', 'bin', 'wasm-pack')
    if (fs.existsSync(inCargo)) {
        return inCargo
    }
}
