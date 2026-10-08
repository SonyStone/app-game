import { For, Show } from 'solid-js';
import { tools } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { galleryUi } from '../../kit/variant';
import type { DialModel } from './createDialModel';
import styles from './Dial.module.css';
import { arcPath, polar } from './geometry';
import { Glyph, type GlyphName } from './Glyph';
import { tapHandlers } from './input';
import { orbitRadius, orbitReach } from './layout';

/**
 * The satellites: one ring of beads around the dial, in three segments like a watch bezel. The eight tools face the
 * pen's hand, the view buttons (undo, redo, fit, flip, symmetry) sit on top and the colors below: the current color
 * (a tap turns the dial to Color), the previous one (a tap swaps) and recent colors (a tap paints with it).
 *
 * Choosing a tool or a recent color is a finished action and reports `onDone`; the view buttons repeat and do not.
 */
export function Orbit(props: {
  studio: Studio;
  model: DialModel;
  /** The dial's center in client pixels. */
  center: Point;
  hand: 'left' | 'right';
  /** Shows key hints, for openings by mouse or keyboard. */
  hints: boolean;
  onDone: () => void;
}) {
  /** Angles are laid out for a left hand and mirrored for a right one, except `mirrored: false` (reading order). */
  const side = (angle: number) => (props.hand === 'left' ? angle : 360 - angle);
  const place = (angle: number, size: number, mirrored = true) => {
    const at = polar(orbitRadius, mirrored ? side(angle) : angle);
    return {
      left: `${props.center.x + at.x - size / 2}px`,
      top: `${props.center.y + at.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`
    };
  };
  const band = (from: number, to: number) =>
    props.hand === 'left' ? arcPath(orbitRadius, from, to) : arcPath(orbitRadius, 360 - to, 360 - from);
  const recent = () =>
    props.studio
      .recent()
      .filter((entry) => entry !== props.studio.color() && entry !== props.studio.previous())
      .slice(0, recentAngles.length);
  const view: readonly {
    icon: GlyphName;
    title: string;
    run: () => void;
    on?: () => boolean;
    enabled?: () => boolean;
  }[] = [
    {
      icon: 'undo',
      title: 'Undo (Ctrl+Z)',
      run: () => props.studio.undo(),
      enabled: () => props.studio.canUndo()
    },
    {
      icon: 'redo',
      title: 'Redo (Ctrl+Shift+Z)',
      run: () => props.studio.redo(),
      enabled: () => props.studio.canRedo()
    },
    { icon: 'fit', title: 'Fit the drawing', run: () => props.studio.fit() },
    {
      icon: 'mirror',
      title: 'Flip the view',
      run: () => props.studio.flip(),
      on: () => props.studio.view().flipped
    },
    {
      icon: 'symmetry',
      title: 'Symmetry: paint mirrored',
      run: () => props.studio.toggleSymmetry(),
      on: () => props.studio.symmetry()
    }
  ];

  return (
    <>
      <svg
        class={styles.orbitBands}
        style={{
          left: `${props.center.x - orbitReach}px`,
          top: `${props.center.y - orbitReach}px`
        }}
        width={orbitReach * 2}
        height={orbitReach * 2}
        viewBox={`${-orbitReach} ${-orbitReach} ${orbitReach * 2} ${orbitReach * 2}`}
        aria-hidden="true"
        {...galleryUi}
      >
        <For
          each={[
            band(toolAngles.at(-1)!, toolAngles[0]!),
            band(viewAngles[0]!, viewAngles.at(-1)!),
            band(recentAngles.at(-1)!, colorAngles.current)
          ]}
          keyed={false}
        >
          {(path) => (
            <>
              <path class={styles.bandEdge} d={path()} />
              <path class={styles.band} d={path()} />
            </>
          )}
        </For>
      </svg>

      <For each={tools}>
        {(tool, index) => (
          <button
            {...galleryUi}
            {...tapHandlers(() => {
              props.studio.setTool(tool.id);
              props.onDone();
            })}
            class={[styles.bead, { [styles.lit!]: props.studio.tool() === tool.id }]}
            style={place(toolAngles[index()]!, 34)}
            title={`${tool.label} (${tool.key})`}
          >
            <Glyph name={tool.icon} size={18} />
            <Show when={props.hints}>
              <small class={styles.beadKey}>{tool.key}</small>
            </Show>
          </button>
        )}
      </For>

      <For each={view}>
        {(entry, index) => (
          <button
            {...galleryUi}
            {...tapHandlers(() => entry.run())}
            class={[styles.bead, { [styles.lit!]: entry.on?.() === true, [styles.off!]: entry.enabled?.() === false }]}
            style={place(viewAngles[index()]!, 34, false)}
            title={entry.title}
          >
            <Glyph name={entry.icon} size={18} />
          </button>
        )}
      </For>

      <button
        {...galleryUi}
        {...tapHandlers(() => props.model.setMode('color'))}
        class={[styles.swatch, styles.current, { [styles.lit!]: props.model.mode() === 'color' }]}
        style={{ ...place(colorAngles.current, 34), background: props.studio.color() }}
        title="Current color: turn the dial to pick"
      />
      <button
        {...galleryUi}
        {...tapHandlers(() => props.studio.swapColors())}
        class={styles.swatch}
        style={{ ...place(colorAngles.previous, 28), background: props.studio.previous() }}
        title={props.hints ? 'Previous color: swap (X)' : 'Previous color: swap'}
      />
      <For each={recent()} keyed={false}>
        {(color, index) => (
          <button
            {...galleryUi}
            {...tapHandlers(() => {
              props.studio.chooseColor(color());
              props.onDone();
            })}
            class={styles.swatch}
            style={{ ...place(recentAngles[index]!, 28), background: color() }}
            title={color()}
          />
        )}
      </For>
    </>
  );
}

/**
 * Bead angles for a left hand, degrees clockwise from 12 o'clock: 38 px apart for 34 px beads, 31 px for 28 px colors. Tools
 * run top to bottom in the catalog's order.
 */
const toolAngles = tools.map((_, index) => 311 - index * 14);
const viewAngles = [-28, -14, 0, 14, 28];
const colorAngles = { current: 193, previous: 180.1 };
const recentAngles = Array.from({ length: 7 }, (_, index) => 168.7 - index * 11.4);
