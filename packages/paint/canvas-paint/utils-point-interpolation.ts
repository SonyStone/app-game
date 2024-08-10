import { Vec2Tuple } from '@packages/math';

export const createInterpoletePoints = () => {
  let prev: Vec2Tuple | undefined;

  return (point: Vec2Tuple) => {
    const outPoints = [];
    if (prev) {
      const dist = Math.sqrt(Math.pow(point[0] - prev[0], 2) + Math.pow(point[1] - prev[1], 2));
      const angle = Math.atan2(point[1] - prev[1], point[0] - prev[0]);
      for (let i = 0; i < dist; i += 2) {
        let point = [prev[0] + i * Math.cos(angle), prev[1] + i * Math.sin(angle)];
        outPoints.push(point);
      }
    } else {
      outPoints.push(point);
    }

    prev = point;

    return outPoints;
  };
};
