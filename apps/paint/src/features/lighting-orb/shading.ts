import { hexToHsv, hsvToHex } from '../color/hsv';

/**
 * The Lighting Orb's setup: a sphere of the `base` color lit by a main light of the `light` color from the upper right,
 * its far side lit only by ambient and reflected light of the `shadow` color. Colors are `#rrggbb`. Of `light` and
 * `shadow` only hue and saturation count: their brightness follows `contrast`, from 0 (the base color everywhere) to
 * 1 (a bright light and deep shadows).
 */
export type OrbLights = { base: string; light: string; shadow: string; contrast: number };

/**
 * The orb's color at `x`, `y` on its disc, the unit circle with `y` pointing down, as `#rrggbb`. Points outside the
 * disc take the color of the rim beside them.
 */
export function orbColor(lights: OrbLights, x: number, y: number): string {
  const [r, g, b] = createOrbShader(lights)(x, y);
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/**
 * Prepares `lights` for shading many points, such as every pixel of the orb: returns a function of a point on the disc
 * (as in {@link orbColor}) giving sRGB channels from 0 to 1.
 *
 * The sphere is lit in linear light. Toward the main light the base color brightens and takes on the light's color
 * (a diffuse, Lambertian falloff), with a soft specular highlight of the paled light color near the center's upper
 * right; away from it the color sinks toward a dark shade of the shadow color. `contrast` scales all three, through a
 * square root so that low contrasts still model the sphere.
 */
export function createOrbShader({ base, light, shadow, contrast }: OrbLights) {
  // Low contrasts still model the sphere visibly, as the app's do.
  const k = Math.sqrt(Math.min(1, Math.max(0, contrast)));
  const object = toLinear(base);
  const lightHsv = hexToHsv(light);
  const lamp = toLinear(hsvToHex({ h: lightHsv.h, s: lightHsv.s, v: 1 }));
  const shadowHsv = hexToHsv(shadow);
  const shade = toLinear(hsvToHex({ h: shadowHsv.h, s: shadowHsv.s, v: shadowBrightness }));
  // The lit color: the object under the light, brightened, part of the way to the light's own color.
  const lit = object.map((channel, index) => Math.min(1, channel * lamp[index]! * litGain) * 0.7 + lamp[index]! * 0.3);
  // The highlight: the light's color, paled as a bright reflection is.
  const gleam = lamp.map((channel) => channel + (1 - channel) * glossPaling);

  return (x: number, y: number): [number, number, number] => {
    const reach = Math.hypot(x, y);
    const [px, py] = reach > 1 ? [x / reach, y / reach] : [x, y];
    const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));
    const diffuse = px * lightDirection[0] + py * lightDirection[1] + pz * lightDirection[2];
    const gloss = Math.max(0, px * halfway[0] + py * halfway[1] + pz * halfway[2]) ** shininess;
    const toLight = k * litShare * smoothstep(0.2, 1, diffuse);
    const toShadow = k * shadowShare * smoothstep(0.55, -0.5, diffuse);
    const toGloss = k * glossShare * gloss;

    return object.map((channel, index) => {
      let value = channel + (lit[index]! - channel) * toLight;
      value += (shade[index]! - value) * toShadow;
      value += (gleam[index]! - value) * toGloss;
      return encode(Math.min(1, Math.max(0, value)));
    }) as [number, number, number];
  };
}

/** Where the main light comes from: the upper right and toward the viewer. */
const lightDirection = normalize([0.55, -0.6, 0.58]);
/** Halfway between the light and the viewer, where the highlight sits. */
const halfway = normalize([lightDirection[0], lightDirection[1], lightDirection[2] + 1]);

/** Brightness of the shadow color at full contrast. */
const shadowBrightness = 0.14;
/** How much the light brightens the object's own color. */
const litGain = 1.8;
/** How far, at full contrast, the lit side, the far side and the highlight go to their colors. */
const litShare = 0.85;
const shadowShare = 0.97;
const glossShare = 0.7;
/** How far the highlight's color goes toward white. */
const glossPaling = 0.35;
/** The highlight's tightness. */
const shininess = 14;

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/** 0 at `edge0`, 1 at `edge1`, smooth between; the edges may be in either order. */
function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function toLinear(hex: string) {
  const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const encoded = channel / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  });
}

function encode(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}
