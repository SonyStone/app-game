const DEG_2_RAD = Math.PI / 180;
const RAD_2_DEG = 180 / Math.PI;

export function degToRad(degrees: number): number {
  return degrees * DEG_2_RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD_2_DEG;
}
