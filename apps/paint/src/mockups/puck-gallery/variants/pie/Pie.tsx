import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import type { Preset } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { NavigationKind } from '../../kit/navigationDrag';
import { StrokePreview } from '../../kit/StrokePreview';
import { galleryUi } from '../../kit/variant';
import styles from './pie.module.css';
import { anchorTranslate, directionKeys, directionPoint, directions, type Direction } from './pieGeometry';

/**
 * One pie item: an action that runs at once, a submenu that opens its own pie under the pointer, or a navigation
 * that follows the pointer (while pressed, or modally until the next click, as Blender's operators do).
 */
export type PieItem = {
  id: string;
  label: string;
  icon?: SketchIconName;
  /** Small text at the item's end, such as a value or the current choice. */
  detail?: string;
  /** Shown pressed, as Blender shows the current tool or the active option. */
  active?: boolean;
  disabled?: boolean;
  /** A color swatch instead of an icon. */
  swatch?: string;
  /** A brush preset, shown with its sample stroke. */
  preset?: Preset;
  /** Dot diameter in CSS pixels, for brush-size values. */
  dot?: number;
} & (
  | {
      kind: 'action';
      run: () => void;
      /** Undo and Redo run again and again, so they keep the pie open. */ repeat?: boolean;
    }
  | { kind: 'menu'; /** Opens the submenu under `at`, where the choice was made. */ open: (at: Point) => void }
  | { kind: 'drag'; navigation: NavigationKind }
);

/** A pie: its title, up to eight items by direction, and optional extra rows under the bottom item. */
export type PieDefinition = {
  title: string;
  items: Partial<Record<Direction, PieItem>>;
  /** Radius of the circle the items sit on. */
  radius: number;
  /** Radius of the middle, where no direction is chosen; a widget may fill it. */
  dead: number;
  /** A widget in the middle, such as a color wheel. */
  center?: () => JSX.Element;
  /** Rows under the bottom item, as Blender lists a pie's extra items. */
  extras?: () => JSX.Element;
  /** The extras' height in CSS pixels, so that the pie can be placed to fit the window. */
  extrasHeight?: number;
  /** Items carry wide brush samples, so the pie needs more room at its sides. */
  wide?: boolean;
  /** Letter keys (`KeyT`…) that choose items besides the number keys. */
  letters?: Readonly<Record<string, () => PieItem>>;
};

/**
 * Draws a pie around `center`: the ring in the middle with the pointed direction lit, the items on their circle
 * hanging outward, the extras under the bottom item and a line from the middle toward the pointer, as a marking
 * menu draws its mark. It takes no presses itself except in its widgets; the variant's catcher reads directions.
 */
export function Pie(props: {
  definition: PieDefinition;
  center: Point;
  highlight: Direction | undefined;
  /** The item that just ran, flashed briefly; a new `count` flashes again. */
  flash?: { id: string; count: number } | undefined;
  /** The pointer, for the mark from the middle. */
  pointer: Point | undefined;
  /** Hides the key hints for fingers. */
  touch: boolean;
}) {
  const definition = () => props.definition;
  const markEnd = () => {
    const pointer = props.pointer;
    if (!pointer || props.highlight === undefined) {
      return undefined;
    }

    const dx = pointer.x - props.center.x;
    const dy = pointer.y - props.center.y;
    const length = Math.hypot(dx, dy);
    const reach = Math.min(length, definition().radius - 6);
    return length < definition().dead ? undefined : { x: (dx / length) * reach, y: (dy / length) * reach };
  };

  return (
    <div
      class={styles.pie}
      {...galleryUi}
      data-touch={props.touch || undefined}
      style={{ left: `${props.center.x}px`, top: `${props.center.y}px` }}
    >
      <svg class={styles.ring} width="1" height="1" aria-hidden="true">
        <Show when={markEnd()}>{(end) => <line class={styles.mark} x1="0" y1="0" x2={end().x} y2={end().y} />}</Show>
        <circle class={styles.ringTrack} r={Math.min(definition().dead, 26) - 4} />
        <Show when={props.highlight !== undefined}>
          <path class={styles.ringLit} d={arc(props.highlight!, Math.min(definition().dead, 26) - 4)} />
        </Show>
      </svg>
      <Show when={definition().center}>{(center) => <div class={styles.centerWidget}>{center()()}</div>}</Show>
      <span
        class={styles.title}
        style={{ top: `${-definition().radius - itemHeight(definition(), props.touch) - 22}px` }}
      >
        {definition().title}
      </span>
      <For each={directions} keyed={false}>
        {(direction) => (
          <Show when={definition().items[direction()]}>
            {(item) => {
              const spot = () => directionPoint({ x: 0, y: 0 }, direction(), definition().radius);
              return (
                <div
                  class={[
                    styles.item,
                    {
                      [styles.lit!]: props.highlight === direction(),
                      [styles.active!]: !!item().active,
                      [styles.disabled!]: !!item().disabled,
                      [styles.flash!]: props.flash?.id === item().id && props.flash.count % 2 === 0,
                      [styles.flashAgain!]: props.flash?.id === item().id && props.flash.count % 2 === 1,
                      [styles.wide!]: !!item().preset
                    }
                  ]}
                  style={{ left: `${spot().x}px`, top: `${spot().y}px`, translate: anchorTranslate(direction()) }}
                >
                  <Show when={item().preset}>
                    {(preset) => <StrokePreview class={styles.stroke} preset={preset()} color="#e6e6e6" height={22} />}
                  </Show>
                  <span class={styles.itemRow}>
                    <Show when={item().swatch}>
                      {(swatch) => <span class={styles.swatch} style={{ background: swatch() }} />}
                    </Show>
                    <Show when={item().dot}>
                      {(dot) => (
                        <span class={styles.dotBox}>
                          <span class={styles.dot} style={{ width: `${dot()}px`, height: `${dot()}px` }} />
                        </span>
                      )}
                    </Show>
                    <Show when={item().icon}>{(icon) => <SketchIcon name={icon()} size={16} />}</Show>
                    <span class={styles.label}>{item().label}</span>
                    <Show when={item().detail}>{(detail) => <span class={styles.detail}>{detail()}</span>}</Show>
                    <Show when={item().kind === 'menu'}>
                      <span class={styles.chevron}>▸</span>
                    </Show>
                    <Show when={!props.touch}>
                      <kbd class={styles.key}>{directionKeys[direction()]}</kbd>
                    </Show>
                  </span>
                </div>
              );
            }}
          </Show>
        )}
      </For>
      <Show when={definition().extras}>
        {(extras) => (
          <div class={styles.extras} style={{ top: `${definition().radius + extrasGap(definition(), props.touch)}px` }}>
            {extras()()}
          </div>
        )}
      </Show>
    </div>
  );
}

/** How far below the item circle the extras start: under the bottom item. */
export function extrasGap(definition: PieDefinition, touch: boolean) {
  return itemHeight(definition, touch) + 12;
}

/** An item's height: taller for fingers, and taller again with a brush sample. */
function itemHeight(definition: PieDefinition, touch: boolean) {
  return (touch ? 40 : 30) + (definition.wide ? 26 : 0);
}

/** The SVG path of the lit 45° arc of the middle ring toward `direction`. */
function arc(direction: Direction, radius: number) {
  const from = ((direction - 0.5) * Math.PI) / 4;
  const to = ((direction + 0.5) * Math.PI) / 4;
  const point = (angle: number) => `${Math.cos(angle) * radius} ${Math.sin(angle) * radius}`;
  return `M ${point(from)} A ${radius} ${radius} 0 0 1 ${point(to)}`;
}
