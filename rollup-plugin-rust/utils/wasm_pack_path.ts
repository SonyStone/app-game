import { homedir } from 'os';

export function wasm_pack_path(wasmPackPath: string) {
  if (wasmPackPath !== undefined) {
    if (typeof wasmPackPath !== 'string') {
      throw new Error("'wasmPackPath' option must be a string");
    }

    // https://www.gnu.org/software/bash/manual/html_node/Tilde-Expansion.html
    return wasmPackPath.replace(/^~(?=$|[\/\\])/, function () {
      return homedir();
    });
  } else if (process.platform === 'win32') {
    // TODO pretty hacky, but needed to make it work on Windows
    return 'wasm-pack.cmd';
  } else {
    return 'wasm-pack';
  }
}
