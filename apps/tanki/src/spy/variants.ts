/**
 * The axes along which the Spy sandbox varies, each switchable at run time by a key and kept in
 * the address, so a variant can be shared as a link:
 *
 * - `role` (T, `?role=`): who the player is. `spy` plays the spider against bot tanks, `tank`
 *   drives a tank hunted by a bot spider, `watch` leaves both sides to bots.
 * - `visibility` (V, `?vis=`): the rule that decides when a tank sees the spider; see `sees`.
 * - `ability` (B, `?ability=`): what the spider does from a tank's stern.
 * - `gait` (G, `?gait=`): the spider's build.
 * - `cones` (C, `?cones=`): which tanks' sight is drawn on the floor.
 */
export type Variant = {
  role: Role;
  visibility: VisibilityRule;
  ability: Ability;
  gait: Gait;
  cones: ConeDisplay;
};

/** Who the player controls: the spider, a tank, or no one while the bots play each other. */
export const ROLES = ['spy', 'tank', 'watch'] as const;

export type Role = (typeof ROLES)[number];

/**
 * When a tank sees the spider:
 *
 * - `cone`: in line of sight and within `VIEW.halfAngle` of the tank's barrel. Behind a tank the
 *   spider stays unseen until the turret turns toward it.
 * - `hidden`: never, except while an action gives it away for `VIEW.revealTime` seconds; then
 *   any tank with line of sight sees it, whatever way its barrel points.
 * - `range`: as `cone`, and no farther than `VIEW.shortRange`.
 */
export const VISIBILITY_RULES = ['cone', 'hidden', 'range'] as const;

export type VisibilityRule = (typeof VISIBILITY_RULES)[number];

/**
 * What the spider does once it holds on to a tank's stern:
 *
 * - `infect`: takes the tank over for `ABILITY.infectTime` seconds; its own team takes it for a
 *   friend until it fires.
 * - `backstab`: drills through the rear armor into the core, which destroys the tank.
 * - `jam`: plants a magnetic charge that stops the tank from driving, turning its turret and
 *   firing for `ABILITY.jamTime` seconds.
 */
export const ABILITIES = ['infect', 'backstab', 'jam'] as const;

export type Ability = (typeof ABILITIES)[number];

/**
 * The spider's build: `low` is small, low and quick and climbs rubble; `tall` is slower, stands
 * higher on longer legs and also steps over the low concrete barriers.
 */
export const GAITS = ['low', 'tall'] as const;

export type Gait = (typeof GAITS)[number];

/** Which tanks' sight to draw on the floor: those near the spider, all of them, or none. */
export const CONE_DISPLAYS = ['near', 'all', 'off'] as const;

export type ConeDisplay = (typeof CONE_DISPLAYS)[number];

/** Each axis: its key, its parameter in the address and its values, the first being the default. */
export const AXES = {
  role: { key: 'KeyT', param: 'role', values: ROLES },
  visibility: { key: 'KeyV', param: 'vis', values: VISIBILITY_RULES },
  ability: { key: 'KeyB', param: 'ability', values: ABILITIES },
  gait: { key: 'KeyG', param: 'gait', values: GAITS },
  cones: { key: 'KeyC', param: 'cones', values: CONE_DISPLAYS }
} as const;

/** Reads every axis from `search`, an address's query string; missing or unknown values fall back to the defaults. */
export function variantFromSearch(search: string): Variant {
  const params = new URLSearchParams(search);
  const pick = <Values extends readonly string[]>(param: string, values: Values): Values[number] =>
    values.find((value) => value === params.get(param)) ?? values[0];

  return {
    role: pick(AXES.role.param, AXES.role.values),
    visibility: pick(AXES.visibility.param, AXES.visibility.values),
    ability: pick(AXES.ability.param, AXES.ability.values),
    gait: pick(AXES.gait.param, AXES.gait.values),
    cones: pick(AXES.cones.param, AXES.cones.values)
  };
}

/** The variant with `axis` moved to its next value, wrapping around. */
export function nextVariant(variant: Variant, axis: keyof Variant): Variant {
  const values: readonly string[] = AXES[axis].values;
  const next = values[(values.indexOf(variant[axis]) + 1) % values.length];

  return { ...variant, [axis]: next };
}

/** Writes every axis of `variant` into the address's query, keeping its other parameters. */
export function searchWithVariant(search: string, variant: Variant) {
  const params = new URLSearchParams(search);

  for (const axis of Object.keys(AXES) as (keyof Variant)[]) {
    params.set(AXES[axis].param, variant[axis]);
  }

  return `?${params}`;
}
