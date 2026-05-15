import { Color } from '../color';
import type { ColorArguments } from '../types';

export function valid(...args: ColorArguments): boolean {
  try {
    new Color(...args);
    return true;
  } catch {
    return false;
  }
}
