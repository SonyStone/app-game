import $child, { spawn } from 'child_process';
import { readFile, rm } from 'fs/promises';
import { dirname, join, posix, relative, resolve } from 'path';
import { SourceDescription, TransformPluginContext } from 'rollup';
import { parse } from 'toml';

import { BuildState } from '.';
import { lock } from './utils/lock';
import { posixPath } from './utils/posixPath';
import { wait } from './utils/wait';
import { wasm_pack_path } from './utils/wasm_pack_path';
import { watch_files } from './utils/watch_files';

export interface BuildOptions {
  watchPatterns: string[];
  wasmPackPath: string;
  importHook: (path: any) => string;
  serverPath: string;
  cargoArgs: string[];
  inlineWasm: boolean;
  verbose: boolean;
  nodejs: boolean;
  watch: boolean;
  debug: boolean;
  outDir: string | undefined;
}

export async function build(
  cx: TransformPluginContext,
  state: BuildState,
  source: string,
  id: string,
  options: BuildOptions
) {
  const dir = dirname(id);

  const [output] = await Promise.all([
    wasm_pack(cx, state, dir, source, id, options),
    watch_files(cx, dir, options),
  ]);

  return output;
}

async function wasm_pack(
  cx: TransformPluginContext,
  state: BuildState,
  dir: string,
  source: string,
  id: string,
  options: BuildOptions
): Promise<SourceDescription> {
  const target_dir = await get_target_dir(dir); // ! ? target ??????
  const toml = parse(source);
  const name = toml.package.name;
  const out_dir = resolve(join(target_dir, 'wasm-pack', name));

  const { verbose, debug, cargoArgs, wasmPackPath } = options;

  await rm(out_dir);

  const args = [
    '--log-level',
    verbose ? 'info' : 'error',
    'build',
    '--out-dir',
    out_dir,
    '--out-name',
    'index',
    '--target',
    'web',
    debug ? '--dev' : '--release',
    '--',
  ].concat(cargoArgs);

  const command = wasm_pack_path(wasmPackPath);

  try {
    // TODO what if it tries to build the same crate multiple times ?
    // TODO maybe it can run `cargo fetch` without locking ?
    await lock(async function () {
      await wait(spawn(command, args, { cwd: dir, stdio: 'inherit' }));
    });
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      throw new Error('Could not find wasm-pack, please report this as a bug');
    } else if (verbose) {
      throw e;
    } else {
      throw new Error('Rust compilation failed');
    }
  }

  // TODO better way to generate the path
  const import_path = JSON.stringify(
    './' + posixPath(relative(dir, join(out_dir, 'index.js')))
  );

  const wasm = await readFile(join(out_dir, 'index_bg.wasm'));

  const is_entry = cx.getModuleInfo(id)?.isEntry ?? false;

  if (options.inlineWasm) {
    const base64_decode = `
            const base64codes = [62,0,0,0,63,52,53,54,55,56,57,58,59,60,61,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,0,0,0,0,0,0,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51];

            function getBase64Code(charCode) {
                return base64codes[charCode - 43];
            }

            function base64_decode(str) {
                let missingOctets = str.endsWith("==") ? 2 : str.endsWith("=") ? 1 : 0;
                let n = str.length;
                let result = new Uint8Array(3 * (n / 4));
                let buffer;

                for (let i = 0, j = 0; i < n; i += 4, j += 3) {
                    buffer =
                        getBase64Code(str.charCodeAt(i)) << 18 |
                        getBase64Code(str.charCodeAt(i + 1)) << 12 |
                        getBase64Code(str.charCodeAt(i + 2)) << 6 |
                        getBase64Code(str.charCodeAt(i + 3));
                    result[j] = buffer >> 16;
                    result[j + 1] = (buffer >> 8) & 0xFF;
                    result[j + 2] = buffer & 0xFF;
                }

                return result.subarray(0, result.length - missingOctets);
            }
        `;

    const wasm_string = JSON.stringify(wasm.toString('base64'));

    if (is_entry) {
      return {
        code: `import init from ${import_path};

               ${base64_decode}

               const wasm_code = base64_decode(${wasm_string});

               init(wasm_code).catch(console.error);`,
        map: { mappings: '' },
      };
    } else {
      return {
        code: `import * as exports from ${import_path};

               ${base64_decode}

               const wasm_code = base64_decode(${wasm_string});

               export default async () => {
                 await exports.default(wasm_code);
                 return exports;
               };`,
        map: { mappings: '' },
        moduleSideEffects: false,
      };
    }
  } else {
    let fileId;

    if (options.outDir == null) {
      fileId = cx.emitFile({
        type: 'asset',
        source: wasm,
        name: name + '.wasm',
      });
    } else {
      cx.warn(
        'The outDir option is deprecated, use output.assetFileNames instead'
      );

      const wasm_name = posix.join(options.outDir, name + '.wasm');

      fileId = cx.emitFile({
        type: 'asset',
        source: wasm,
        fileName: wasm_name,
      });
    }

    state.fileIds.add(fileId);

    let import_wasm = `import.meta.ROLLUP_FILE_URL_${fileId}`;

    let prelude = '';

    if (options.nodejs) {
      prelude = `function loadFile(url) {
                   return require("fs/promises").readFile(url);
                 }`;

      import_wasm = `loadFile(${import_wasm})`;
    }

    if (is_entry) {
      return {
        code: `import init from ${import_path};
               ${prelude}

               init(${import_wasm}).catch(console.error);`,
        map: { mappings: '' },
      };
    } else {
      return {
        code: `import * as exports from ${import_path};
               ${prelude}

               export default async (opt = {}) => {
                   let {importHook, serverPath} = opt;

                   let path = ${import_wasm};

                   if (serverPath != null) {
                       path = serverPath + /[^\\/\\\\]*$/.exec(path)[0];
                   }

                   if (importHook != null) {
                       path = importHook(path);
                   }

                   await exports.default(path);
                   return exports;
               };`,
        map: { mappings: '' },
        moduleSideEffects: false,
      };
    }
  }
}

function exec(cmd: string, options: any) {
  return new Promise((resolve, reject) => {
    $child.exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else if (stderr.length > 0) {
        reject(new Error(stderr as any));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function get_target_dir(dir?: any) {
  return 'target';

  // TODO make this faster somehow
  //const metadata = await exec("cargo metadata --no-deps --format-version 1", { cwd: dir });
  //return JSON.parse(metadata).target_directory;
}
