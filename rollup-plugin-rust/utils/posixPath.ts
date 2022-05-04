import { posix } from 'path';

export function posixPath(path: string) {
  return path.replace(/\\/g, posix.sep);
}
