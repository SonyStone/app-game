import { Vec2 } from '@packages/math';

export const createInterpoletePoints = () => {
  let prev: Vec2 | undefined;

  return (point: Vec2) => {
    const outPoints = [];
    if (prev) {
      const dist = Vec2.distance(point, prev);
      const angle = Vec2.angleTo(point, prev);
      for (let i = 0; i < dist; i += 2) {
        const point = Vec2.create(prev.x + i * Math.cos(angle), prev.y + i * Math.sin(angle));
        outPoints.push(point);
      }
    } else {
      outPoints.push(point);
    }

    prev = point;

    return outPoints;
  };
};
