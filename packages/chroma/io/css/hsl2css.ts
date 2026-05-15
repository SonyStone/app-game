import { last, unpack } from '../../utils';

const roundPercentage = (value: number) => Math.round(value * 100) / 100;

export function hsl2css(...args: unknown[]): string {
  const hsla = [...(unpack(args, 'hsla') as number[])];
  let mode = last(args) ?? 'hsl';
  hsla[0] = roundPercentage(hsla[0] ?? 0);
  hsla[1] = Number(`${roundPercentage((hsla[1] ?? 0) * 100)}`);
  hsla[2] = Number(`${roundPercentage((hsla[2] ?? 0) * 100)}`);

  const components = [`${hsla[0]}`, `${hsla[1]}%`, `${hsla[2]}%`];
  if (mode === 'hsla' || (hsla.length > 3 && (hsla[3] ?? 1) < 1)) {
    components.push(`${hsla.length > 3 ? (hsla[3] ?? 1) : 1}`);
    mode = 'hsla';
  }

  return `${mode}(${components.join(',')})`;
}
