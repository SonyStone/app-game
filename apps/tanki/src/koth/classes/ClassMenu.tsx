import { For, Show } from 'solid-js';
import { TURRET_CASEMATE, TURRET_GATLING, TURRET_LONG_GUN, TURRET_MORTAR, TURRET_TWIN } from '../../damage/renderer';
import type { HullSpec } from '../../damage/shapes';
import { useKothI18n } from '../i18n/i18n';
import '../poster.css';
import { TANK_CLASS_IDS, type TankClass, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';

/**
 * The class menu, as Team Fortress 2's, on a constructivist poster (see `poster.css`): the five
 * classes side by side, each with its silhouette, its key, what it is for and bars for its speed,
 * armor and reach. Picking one asks for it; in the player's base the tank changes at once,
 * elsewhere at the next respawn.
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
  const { t } = useKothI18n();

  return (
    <div class="tk-backdrop absolute inset-0 grid place-items-center" onClick={() => props.onClose()}>
      <div class="tk-sheet" onClick={(event) => event.stopPropagation()}>
        <header class="tk-head">
          <div class="tk-wedge" />
          <div class="tk-disc" />
          <div class="tk-title">{t('classMenu.title')}</div>
        </header>
        <div class="flex gap-3.5 px-[18px] pt-4 pb-2">
          <For each={[...TANK_CLASS_IDS]}>
            {(id, index) => {
              const tankClass = TANK_CLASSES[id];

              return (
                <button class={['tk-class', { 'tk-on': id === props.current }]} onClick={() => props.onChoose(id)}>
                  <div class="flex w-full items-center justify-between">
                    <span class="tk-number">{index() + 1}</span>
                    <Show when={id === props.next}>
                      <span class="tk-tag tk-tag-yellow">{t('classMenu.next')}</span>
                    </Show>
                    <Show when={id === props.current && id !== props.next}>
                      <span class="tk-tag">{t('classMenu.current')}</span>
                    </Show>
                  </div>
                  <ClassSilhouette tankClass={tankClass} color={props.color} width={136} height={76} />
                  <div class="tk-class-name">{t(`tankClass.${id}`)}</div>
                  <div class="tk-class-role">{t(`classRole.${id}`)}</div>
                  <StatBar label={t('classMenu.speed')} value={tankClass.speed / fastest()} />
                  <StatBar label={t('classMenu.armor')} value={armorOf(tankClass)} />
                  <StatBar label={t('classMenu.reach')} value={reachOf(tankClass) / farthest()} />
                </button>
              );
            }}
          </For>
        </div>
        <div class="tk-note px-[18px] pb-3.5">{t('classMenu.hint')}</div>
      </div>
    </div>
  );
}

/** A labelled bar, filled to `value` 0-1. */
function StatBar(props: { label: string; value: number }) {
  return (
    <div class="tk-stat">
      <span>{props.label}</span>
      <div class="tk-bar">
        <div style={{ width: `${Math.round(Math.min(Math.max(props.value, 0.05), 1) * 100)}%` }} />
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
  const mount = () => props.tankClass.look.mount ?? { x: 0, y: 0 };

  return (
    <svg width={props.width} height={props.height} viewBox="-30 -21 84 42" class="block">
      <g stroke="#050505" stroke-width="1" stroke-linejoin="round" fill={props.color}>
        <rect x={-hull().halfLength} y={-hull().halfWidth} width={hull().halfLength * 2} height={hull().halfWidth * 2} rx={hull().corner} />
        <For each={hullLines(hull())}>{(line) => <path d={line} fill="none" stroke-width="0.8" />}</For>
        <Show when={props.tankClass.look.casemate}>{turretShape(TURRET_CASEMATE)}</Show>
        <g transform={`translate(${mount().x} ${mount().y})`}>{turretShape(turret())}</g>
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
          <rect x="-6.5" y="-9.5" width="23" height="19" rx="3" />
          <g fill="none">
            <rect x="-5" y="-6" width="8" height="12" rx="1" />
            <path d="M 3 6 L 15.2 8.2 M 3 -6 L 15.2 -8.2 M -5 6 L -6 9 M -5 -6 L -6 -9" />
            <circle cx="-2.4" cy="-2.6" r="1.9" stroke-width="0.9" />
          </g>
        </>
      );

    case TURRET_LONG_GUN:
      return (
        <>
          <rect x="2" y="-1.9" width="24" height="3.8" rx="1" />
          <rect x="24.4" y="-3" width="4" height="6" rx="0.7" />
          <rect x="-3" y="-4.1" width="9" height="8.2" rx="3.4" />
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

/** Speed of the fastest class as the classes stand, tuning included, which fills the speed bar. */
function fastest() {
  return Math.max(...Object.values(TANK_CLASSES).map((tankClass) => tankClass.speed));
}

/** Reach of the farthest-reaching class as the classes stand, which fills the reach bar. */
function farthest() {
  return Math.max(...Object.values(TANK_CLASSES).map(reachOf));
}

/** How thick the armor round the core is on average, as thick again as plating makes it hold, against the thickest. */
function armorOf(tankClass: TankClass) {
  const { halfLength, halfWidth, core, plating } = tankClass.hull;
  const rear = halfLength + core.x - core.radius;
  const side = halfWidth - core.radius;
  return (rear + side * 2) / 3 / (plating ?? 1) / 10;
}

/** How far the class's gun reaches, at full charge for a charged gun, in pixels. */
function reachOf(tankClass: TankClass) {
  return tankClass.weapon.kind === 'charge' ? tankClass.weapon.full.range : tankClass.shell.range;
}
