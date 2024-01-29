import { Vec2Tuple } from 'ogl';
import { degToRad } from 'three/src/math/MathUtils';

// [tiltXrad, tiltYrad] => [azimuthRad, altitudeRad]
// tiltX and tiltY should be in the range [0, pi/2]
export function tilt2spherical(inVec: Vec2Tuple) {
  const [tiltX, tiltY] = inVec;

  const tiltXrad = degToRad(tiltX);
  const tiltYrad = degToRad(tiltY);

  if (tiltXrad === 0 && tiltYrad === 0) {
    // pen perpendicular to the pad
    return [0, Math.PI / 2];
  }

  // X and Y of a vector created by the intersection of tilt planes
  // first normal vectors of tiltX and tiltY planes are defined
  // from that cross product is done to find this vector perpendicular to both plane's normal vector
  // in this unit vector Z is ignored to get x y coords projected on the pad
  const y = Math.cos(tiltXrad) * Math.sin(tiltYrad);
  const x = -Math.sin(tiltXrad) * -Math.cos(tiltYrad);
  const z = -Math.cos(tiltXrad) * -Math.cos(tiltYrad);

  // compute angle of the projected 2D vector to get azimuth in the proper direction
  let azimuthRad = Math.atan2(y, x);
  if (azimuthRad < 0) {
    // make always positive in range from 0 to 2*pi
    azimuthRad += 2 * Math.PI;
  }

  const vecLenOn2DPad = Math.sqrt(x * x + y * y);
  const altitudeRad = Math.atan(z / vecLenOn2DPad);

  // other possible, simpler way to get altitudeRad which is not 100% correct:
  // deviation: max(7.96°) / avg(2.00°) / median(0.91°)
  // not derived from anything, just two 2D situations combined by a multiplication
  // altitudeRad = math.pi/2-math.acos(math.cos(tiltXrad) * math.cos(tiltYrad))

  return { azimuthRad, altitudeRad };
}
