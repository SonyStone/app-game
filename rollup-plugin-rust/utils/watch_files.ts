import { TransformPluginContext } from 'rollup';
import { BuildOptions } from '../build';
import glob from './glob';

export async function watch_files(
  cx: TransformPluginContext,
  dir: string,
  options: BuildOptions
) {
  if (options.watch) {
    const matches = await Promise.all(
      options.watchPatterns.map(function (pattern) {
        return glob(pattern, {
          cwd: dir,
          strict: true,
          absolute: true,
          nodir: true,
        });
      })
    );

    // TODO deduplicate matches ?
    matches.forEach(function (files) {
      files.forEach(function (file) {
        cx.addWatchFile(file);
      });
    });
  }
}
