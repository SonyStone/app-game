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

export function setFromVec3(spherical: Spherical, [x, y, z]: v3.Vec3) {
  const radius = Math.sqrt(x * x + y * y + z * z);

  spherical.radius = radius;

  if (radius === 0) {
    spherical.theta = 0;
    spherical.phi;
  } else {
    spherical.theta = Math.atan2(x, z);
    spherical.phi = Math.acos(clamp(y / radius, -1, 1));
  }
}

export function setFromSpherical(
  v: v3.Vec3,
  { radius, phi, theta }: Spherical
) {
  const sinPhiRadius = Math.sin(phi) * radius;

  v[0] = sinPhiRadius * Math.sin(theta);
  v[1] = Math.cos(phi) * radius;
  v[2] = sinPhiRadius * Math.cos(theta);
}
