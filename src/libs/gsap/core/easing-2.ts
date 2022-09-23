import { cos, HALF_PI, sqrt } from './utils';

export const linear = (p: number) => p;

const easeOut = (overshoot: number) => (p: number) =>
  p ? (p - 1) ** 2 * ((overshoot + 1) * (p - 1) + overshoot) + 1 : 0;

const easeInOutFromOut = (easeOut: (p: number) => number) => (p: number) =>
  p < 0.5 ? (1 - easeOut(1 - p * 2)) / 2 : 0.5 + easeOut((p - 0.5) * 2) / 2;

const easeInFromOut = (easeOut: (p: number) => number) => (p: number) =>
  1 - easeOut(1 - p);

const ease = (
  easeIn = (p: number) => p,
  easeOut = (p: number) => 1 - easeIn(1 - p),
  easeInOut = (p: number) =>
    p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2
) => ({
  in: easeIn,
  out: easeOut,
  inOut: easeInOut,
});

export const back = ((overshoot: number = 1.70158) =>
  ease(
    easeInFromOut(easeOut(overshoot)),
    easeOut(overshoot),
    easeInOutFromOut(easeOut(overshoot))
  ))();

export const bounce = ((n, c) => {
  const n1 = 1 / c;
  const n2 = 2 * n1;
  const n3 = 2.5 * n1;
  const easeOut = (p: any) =>
    p < n1
      ? n * p * p
      : p < n2
      ? n * (p - 1.5 / c) ** 2 + 0.75
      : p < n3
      ? n * (p -= 2.25 / c) * p + 0.9375
      : n * (p - 2.625 / c) ** 2 + 0.984375;

  return ease((p) => 1 - easeOut(1 - p), easeOut);
})(7.5625, 2.75);

export const circ = ease((p: number) => -(sqrt(1 - p * p) - 1));
export const expo = ease((p: number) => (p ? 2 ** (10 * (p - 1)) : 0));
export const sine = ease((p: number) => (p === 1 ? 1 : -cos(p * HALF_PI) + 1));
// export const elastic = ease((p: number) => );
