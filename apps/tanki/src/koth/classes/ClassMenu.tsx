import { For, Show } from 'solid-js';
import { TURRET_CASEMATE, TURRET_GATLING, TURRET_LONG_GUN, TURRET_MORTAR, TURRET_TWIN } from '../../damage/renderer';
import type { HullSpec } from '../../damage/shapes';
import { TANK_CLASS_IDS, type TankClass, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';

/**
 * The class menu, as Team Fortress 2's: the five classes side by side, each with its silhouette,
 * its key, what it is for and bars for its speed, armor and reach. Picking one asks for it; in the
 * player's base the tank changes at once, elsewhere at the next respawn.
 *
 * @param current - The player's class now.
 * @param next - The class the player asked for that comes with the next respawn, if any.
 * @param color - Hull color of the silhouettes, as CSS.
 * @param onChoose - Called with the class the player picks.
 * @param onClose - Called when the player closes the menu without picking.
 */
export function ClassMenu(props: {
  current: TankClassId;
  next: TankClassId | undefined;
  color: string;
  onChoose: (id: TankClassId) => void;
  onClose: () => void;
}) {
  return (
    <div class="absolute inset-0 grid place-items-center bg-black/40 text-white" onClick={() => props.onClose()}>
      <div class="flex flex-col items-center gap-4 rounded-lg bg-[#1d1d1f]/95 px-6 py-5" onClick={(event) => event.stopPropagation()}>
        <div class="text-2xl font-bold tracking-wide">CHOOSE A CLASS</div>
        <div class="flex gap-3">
          <For each={[...TANK_CLASS_IDS]}>
            {(id, index) => {
              const tankClass = TANK_CLASSES[id];

              return (
                <button
                  class="flex w-40 flex-col items-center gap-1.5 rounded-md border-2 border-solid px-2 pb-3 pt-2 text-white"
                  style={{
                    background: id === props.current ? '#3a3a3d' : '#2a2a2c',
                    'border-color': id === props.next ? '#ffd27a' : id === props.current ? 'rgba(255, 255, 255, 0.8)' : 'transparent'
                  }}
                  onClick={() => props.onChoose(id)}
                >
                  <div class="self-start rounded bg-white/15 px-1.5 text-xs font-bold tabular-nums">{index() + 1}</div>
                  <ClassSilhouette tankClass={tankClass} color={props.color} width={136} height={84} />
                  <div class="text-lg font-bold">{tankClass.name}</div>
                  <div class="h-10 text-center text-[11px] leading-tight text-white/70">{tankClass.role}</div>
                  <StatBar label="Speed" value={tankClass.speed / FASTEST} />
                  <StatBar label="Armor" value={armorOf(tankClass)} />
                  <StatBar label="Reach" value={reachOf(tankClass)} />
                  <Show when={id === props.next}>
                    <div class="text-[11px] font-bold text-[#ffd27a]">next respawn</div>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <div class="text-xs text-white/60">1-5 or click to pick · in your base the change is instant, elsewhere at your next respawn · C or Esc closes</div>
      </div>
    </div>
  );
}

/** A labelled bar, filled to `value` 0-1. */
function StatBar(props: { label: string; value: number }) {
  return (
    <div class="flex w-full items-center gap-2 text-[10px] text-white/70">
      <div class="w-9 text-right">{props.label}</div>
      <div class="h-1.5 flex-1 overflow-hidden rounded bg-white/15">
        <div class="h-full bg-white/85" style={{ width: `${Math.round(Math.min(Math.max(props.value, 0.05), 1) * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * A class's tank drawn from above as in the game, nose to the right: its hull with its painted
 * lines and its turret, or casemate and gun, in flat color with black outlines. The shapes follow
 * the hull's `HullSpec` and the renderer's turret looks.
 *
 * @param color - Fill color, as CSS.
 */
export function ClassSilhouette(props: { tankClass: TankClass; color: string; width: number; height: number }) {
  const hull = () => props.tankClass.hull;
  const turret = () => props.tankClass.look.turret;

  return (
    <svg width={props.width} height={props.height} viewBox="-30 -21 84 42" class="block">
      <g stroke="#050505" stroke-width="1" stroke-linejoin="round" fill={props.color}>
        <rect x={-hull().halfLength} y={-hull().halfWidth} width={hull().halfLength * 2} height={hull().halfWidth * 2} rx={hull().corner} />
        <For each={hullLines(hull())}>{(line) => <path d={line} fill="none" stroke-width="0.8" />}</For>
        <Show when={props.tankClass.look.casemate}>{turretShape(TURRET_CASEMATE)}</Show>
        {turretShape(turret())}
      </g>
    </svg>
  );
}

/** The turret look of `style` as SVG shapes, back to front, after `turretPart` in the renderer. */
function turretShape(style: number) {
  switch (style) {
    case TURRET_TWIN:
      return (
        <>
          <rect x="6" y="-4.6" width="16" height="3.4" rx="0.8" />
          <rect x="6" y="1.2" width="16" height="3.4" rx="0.8" />
          <circle r="7.2" />
        </>
      );

    case TURRET_GATLING:
      return (
        <>
          <rect x="-13" y="-10.5" width="24" height="21" rx="4" />
          <rect x="9.5" y="-5.4" width="11" height="10.8" rx="1.5" />
          <rect x="19" y="-4.15" width="14" height="2.1" rx="0.5" />
          <rect x="19" y="-1.05" width="14" height="2.1" rx="0.5" />
          <rect x="19" y="2.05" width="14" height="2.1" rx="0.5" />
          <rect x="29.2" y="-4.6" width="2.6" height="9.2" rx="0.6" />
        </>
      );

    case TURRET_MORTAR:
      return (
        <>
          <rect x="5.5" y="-6.2" width="13" height="12.4" rx="2.5" />
          <rect x="16.8" y="-7.6" width="4" height="15.2" rx="1.2" />
          <circle r="9.2" />
        </>
      );

    case TURRET_CASEMATE:
      return (
        <>
          <rect x="-9" y="-10" width="24" height="20" rx="2.5" />
          <rect x="-3.5" y="-6.2" width="15" height="12.4" rx="1.5" fill="none" />
        </>
      );

    case TURRET_LONG_GUN:
      return (
        <>
          <rect x="8" y="-2.4" width="40" height="4.8" rx="1" />
          <rect x="44.4" y="-3.9" width="5.2" height="7.8" rx="0.8" />
          <rect x="5" y="-5.6" width="8" height="11.2" rx="2" />
        </>
      );

    default:
      return (
        <>
          <rect x="7.3" y="-3.75" width="22.5" height="7.5" rx="1" />
          <circle r="9.6" />
        </>
      );
  }
}

/** The painted lines of a hull as SVG paths, after `hullPattern` in `../../damage/shapes`. */
function hullLines(hull: HullSpec) {
  const back = -hull.halfLength + 0.5;
  const side = hull.halfWidth - 0.25;
  const nose = hull.halfLength;
  const chevron = (from: number, across: number, to: number) => `M ${from} ${across} L ${to} 0 L ${from} ${-across}`;

  switch (hull.pattern) {
    case 'chevron':
      return [chevron(back, side, nose)];

    case 'dart':
      return [chevron(-hull.halfLength * 0.35, side * 0.7, nose)];

    case 'plated': {
      const skirt = hull.halfWidth - 3.5;
      return [chevron(back + 2, skirt, nose - 1), chevron(back + 9, skirt - 2, nose - 9), `M ${back + 1} ${skirt} L ${nose - 1} ${skirt}`, `M ${back + 1} ${-skirt} L ${nose - 1} ${-skirt}`];
    }

    case 'deck': {
      const left = -hull.halfLength + 3;
      const across = hull.halfWidth - 3.5;
      return [0, 3, 6].map((offset) => `M ${left + offset} ${-across} L ${left + offset} ${across}`);
    }
  }
}

/** Speed of the fastest class, which fills the speed bar. */
const FASTEST = Math.max(...Object.values(TANK_CLASSES).map((tankClass) => tankClass.speed));

/** How thick the armor round the core is on average, against the thickest. */
function armorOf(tankClass: TankClass) {
  const { halfLength, halfWidth, core } = tankClass.hull;
  const rear = halfLength + core.x - core.radius;
  const side = halfWidth - core.radius;
  return (rear + side * 2) / 3 / 10;
}

/** How far the class's gun reaches, against the farthest, at full charge for a charged gun. */
function reachOf(tankClass: TankClass) {
  const range = tankClass.weapon.kind === 'charge' ? tankClass.weapon.full.range : tankClass.shell.range;
  return range / 1300;
}
