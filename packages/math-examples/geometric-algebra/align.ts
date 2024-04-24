import Algebra, { AlgebraElement } from './src';

function randomVector(Ga: typeof AlgebraElement) {
  const value: number[] = [];
  while (value.length < Ga.dimensions) {
    value.push(Math.random() * 4 - 2);
  }

  return Ga.fromVector(value);
}

export function ganja() {
  {
    const PGA2D = Algebra(2, 0, 1);

    console.log(`PGA2D dimensions`, PGA2D.dimensions);

    const vec = randomVector(PGA2D);

    console.log(`randomVector`, vec, vec.inverse());

    const point = (x: number, y: number) =>
      new PGA2D([0, 0, 0, 0, y, -x, 1, 0]);
    const line = (a: number, b: number, c: number) => new PGA2D([c, a, b]);
    const dist = (x: AlgebraElement, y: AlgebraElement) => x.vee(y).norm();
    // const angle = (x: AlgebraElement, y: AlgebraElement) => Math.acos(x.dot(y));

    const a = point(-1, -0.5);
    const b = point(-1, 1);
    const c = point(1, 1);

    const ab = b.vee(a).normalize();
    const bc = c.vee(b).normalize();
    const ca = c.vee(a).normalize();

    const a_to_b = dist(a, b);

    console.log(`🟠`, a);
  }
}
