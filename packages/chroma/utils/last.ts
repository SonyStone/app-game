import { type } from './type';

export function last(args: readonly unknown[]): string | null {
  if (args.length < 2) {
    return null;
  }

  const value = args[args.length - 1];
  return type(value) === 'string' ? String(value).toLowerCase() : null;
}
