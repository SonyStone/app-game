import { Color } from '../color';

const digits = '0123456789abcdef';
const { floor, random } = Math;

export function randomColor(): Color {
  let code = '#';
  for (let index = 0; index < 6; index += 1) {
    code += digits.charAt(floor(random() * 16));
  }

  return new Color(code, 'hex');
}
