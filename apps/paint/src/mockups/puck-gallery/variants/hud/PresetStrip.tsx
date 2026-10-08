import { createSignal, For } from 'solid-js';
import { presets } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { StrokePreview } from '../../kit/StrokePreview';
import { galleryUi } from '../../kit/variant';
import { clamp, openSide, shiftRect, type Rect } from './geometry';
import styles from './Hud.module.css';
import { createTrembleGuard, placeStrip, stripPress, type StripContext } from './strip';
import { createWheelSteps, rectStyle } from './ValueStrip';

/**
 * Opens the column of brush presets on the open side of the pen, with the current preset's card at
 * `context.home`, grouped by set. Sliding up and down previews the preset under the pen (the ring's brush preview
 * shows its size); a commit applies it.
 */
export function createPresetStrip(context: StripContext) {
  const { studio, home } = context;
  const side = openSide(context.hand);
  const start = Math.max(
    0,
    presets.findIndex((preset) => preset.id === studio.preset())
  );
  const height = cardOffsets.at(-1)! + cardHeight + columnInset * 2;
  const column0: Rect = {
    left: side > 0 ? home.x - penInset : home.x + penInset - cardWidth,
    top: home.y - columnInset - cardOffsets[start]! - cardHeight / 2,
    width: cardWidth,
    height
  };
  const column = shiftRect(column0, placeStrip(context, column0));
  const indexAt = (point: Point) => {
    const y = point.y - column.top - columnInset;
    if (Math.abs(point.x - (column.left + cardWidth / 2)) > cardWidth / 2 + 40 || y < -24 || y > height + 24) {
      return undefined;
    }

    return cardOffsets.reduce(
      (best, offset, index) =>
        Math.abs(offset + cardHeight / 2 - y) < Math.abs(cardOffsets[best]! + cardHeight / 2 - y) ? index : best,
      0
    );
  };

  const guard = createTrembleGuard(context);
  const [hovered, setHovered] = createSignal<number>();
  let latest: number | undefined;
  const show = (index: number | undefined) => {
    latest = index;
    setHovered(index);
  };

  return {
    kind: 'presets' as const,
    fn: 'presets' as const,
    side,
    column,
    hovered,
    /** The preset under the pen, for the ring's brush preview. */
    preview: () => {
      const index = hovered();
      return index === undefined ? undefined : presets[index];
    },
    finishes: true,
    move(point: Point) {
      if (guard(point)) {
        show(indexAt(point));
      }
    },
    tap(point: Point) {
      show(indexAt(point));
    },
    step(dx: number, dy: number) {
      const from = latest ?? start;
      show(clamp(from + (-dy || dx), 0, presets.length - 1));
    },
    commit() {
      const chosen = latest === undefined ? undefined : presets[latest];
      show(undefined);
      // A drag that ends on the current preset changes nothing; a tap on it applies it again (resets its values).
      if (!chosen || (context.via === 'drag' && chosen.id === studio.preset())) {
        return false;
      }

      studio.choosePreset(chosen.id);
      return true;
    },
    cancel() {
      show(undefined);
    }
  };
}

/** An open preset strip. */
export type PresetStrip = ReturnType<typeof createPresetStrip>;

/** The preset column: cards with a sample stroke in the current color and the name; the current one is marked. */
export function PresetStripView(props: {
  strip: PresetStrip;
  studio: Studio;
  interactive: boolean;
  /** Hears whether a press on the column applied a preset. */
  committed: (changed: boolean) => void;
}) {
  const strip = props.strip;
  const press = stripPress(strip, (changed) => props.committed(changed));
  const wheel = createWheelSteps((by) => {
    strip.step(0, by);
    strip.commit();
  });

  return (
    <div
      {...galleryUi}
      {...(props.interactive ? press : {})}
      class={[styles.strip, styles.column, { [styles.passive!]: !props.interactive }]}
      style={rectStyle(strip.column)}
      onWheel={(event) => props.interactive && wheel(event)}
    >
      <For each={presets}>
        {(preset, index) => (
          <div
            class={[
              styles.card,
              {
                [styles.hot!]: strip.hovered() === index(),
                [styles.current!]: props.studio.preset() === preset.id,
                [styles.mirrored!]: strip.side < 0
              }
            ]}
            style={{ top: `${columnInset + cardOffsets[index()]!}px` }}
          >
            <span class={styles.cardStroke}>
              <StrokePreview
                preset={preset}
                color={preset.tool === 'eraser' ? '#9a9a9a' : props.studio.color()}
                height={22}
              />
            </span>
            <span class={styles.cardName}>
              <b>{preset.name}</b>
              <small>{preset.set}</small>
            </span>
          </div>
        )}
      </For>
    </div>
  );
}

const cardWidth = 206;
const cardHeight = 32;
/** Padding of the column around its cards. */
const columnInset = 4;
/** How far into the near edge of the column the pen sits. */
const penInset = 30;
/** Each card's top within the column: one card per 34 px, and 8 px more between sets. */
const cardOffsets = presets.map(
  (preset, index) =>
    index * (cardHeight + 2) +
    presets.slice(0, index + 1).filter((entry, at) => at > 0 && entry.set !== presets[at - 1]!.set).length * 8
);
