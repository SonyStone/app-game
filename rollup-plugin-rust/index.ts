import { basename } from 'path';
import { Plugin, ResolveFileUrlHook, TransformHook } from 'rollup';
import { createFilter } from 'rollup-pluginutils';

import { build, BuildOptions } from './build';

export interface RollupPluginRustOptions extends BuildOptions {
  include: Array<string | RegExp> | string | RegExp | null;
  exclude: Array<string | RegExp> | string | RegExp | null;
}

export interface BuildState {
  fileIds: Set<any>;
}

export default function rust(
  options: Partial<RollupPluginRustOptions> = {}
): Plugin {
  // TODO should the filter affect the watching ?
  // TODO should the filter affect the Rust compilation ?

  const include = options.include;
  const exclude = options.exclude;
  const watchPatterns = options.watchPatterns ?? ['src/**'];
  const importHook =
    options.importHook ??
    function (path: any) {
      return JSON.stringify(path);
    };
  const serverPath = options.serverPath ?? '';
  const cargoArgs = options.cargoArgs ?? [];
  const inlineWasm = options.inlineWasm ?? false;
  const verbose = options.verbose ?? false;
  const nodejs = options.nodejs ?? false;
  const wasmPackPath = options.wasmPackPath ?? '';
  const outDir = options.outDir ?? undefined;
  let watch = options.watch ?? false;
  let debug = options.debug ?? false;

  const filter = createFilter(include, exclude);

  const state: BuildState = {
    fileIds: new Set(),
  };

  return {
    name: 'rust',

    buildStart(rollup): void {
      state.fileIds.clear();

      if (this.meta.watchMode || (rollup as any).watch) {
        watch = true;
        debug = true;
      }
    },

    transform(code: string, id: string): ReturnType<TransformHook> {
      if (basename(id) === 'Cargo.toml' && filter(id)) {
        const options: BuildOptions = {
          watchPatterns,
          wasmPackPath,
          importHook,
          serverPath,
          cargoArgs,
          inlineWasm,
          verbose,
          nodejs,
          watch,
          debug,
          outDir,
        };

        return build(this, state, code, id, options);
      } else {
        return null;
      }
    },

    resolveFileUrl(info): ReturnType<ResolveFileUrlHook> {
      if (state.fileIds.has(info.referenceId)) {
        return importHook(serverPath + info.fileName);
      } else {
        return null;
      }
    },
  };
}
