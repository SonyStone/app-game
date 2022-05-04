import { basename } from 'path';
import { Plugin, ResolveFileUrlHook, TransformHook } from 'rollup';

export default function svgFont(): Plugin {
  return {
    name: 'rust',
    transform(code: string, id: string): ReturnType<TransformHook> {
      console.log(`code`, id);

      return null;
    },
  };
}
