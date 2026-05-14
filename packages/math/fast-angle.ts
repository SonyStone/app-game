import { PI_2 } from './constants';
import { Radians } from './types';

// Create lookup tables (e.g., 1-degree increments)
const ANGLE_STEPS = 360;
const cosTable = new Float32Array(ANGLE_STEPS);
const sinTable = new Float32Array(ANGLE_STEPS);

// Initialize at startup
for (let i = 0; i < ANGLE_STEPS; i++) {
  const angle = ((i * PI_2) / ANGLE_STEPS) as Radians;
  cosTable[i] = Math.cos(angle);
  sinTable[i] = Math.sin(angle);
}

// Fast lookup (for discrete angles)
export const fastCos = (degrees: Radians): number => {
  const index = Math.round(((degrees % 360) + 360) % 360);
  return cosTable[index];
};

export const fastSin = (degrees: Radians): number => {
  const index = Math.round(((degrees % 360) + 360) % 360);
  return sinTable[index];
};
