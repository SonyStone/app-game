import { type } from './type';

export function last<Value extends string>(args: readonly unknown[]): Lowercase<Value> | null {
  if (args.length < 2) {
    return null;
  }

  const value = args[args.length - 1];
  return type(value) === 'string' ? (String(value).toLowerCase() as Lowercase<Value>) : null;
}
