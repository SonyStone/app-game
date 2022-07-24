import { clamp } from './utils/clamp';
import * as v3 from './v3';

/**
 * Ref: https://en.wikipedia.org/wiki/Spherical_coordinate_system
 *
 * The polar angle (phi) is measured from the positive y-axis. The positive y-axis is up.
 * The azimuthal angle (theta) is measured from the positive z-axis.
 */
export interface Spherical {
  radius: number;
  // polar angle
  phi: number;
  // azimuthal angle
  theta: number;
}

export function create(radius = 0, theta = 0, phi = 0) {
  return {
    radius,
    theta,
    phi,
  };
}

export function setFromVec3(
  [x, y, z]: v3.Vec3 = v3.create(),
  dst = create()
): Spherical {
  const radius = Math.sqrt(x * x + y * y + z * z);

  dst.radius = radius;

  if (radius === 0) {
    dst.theta = 0;
    dst.phi;
  } else {
    dst.theta = Math.atan2(x, z);
    dst.phi = Math.acos(clamp(y / radius, -1, 1));
  }

  return dst;
}

export function setFromSpherical(
  { radius, phi, theta }: Spherical,
  dst: v3.Vec3 = v3.create()
) {
  const sinPhiRadius = Math.sin(phi) * radius;

  dst[0] = sinPhiRadius * Math.sin(theta);
  dst[1] = Math.cos(phi) * radius;
  dst[2] = sinPhiRadius * Math.cos(theta);

  return dst;
}
