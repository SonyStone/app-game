import { createSignal, For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from '../ComponentCanvas.module.css';
import { iconSets, iconTools, type IconSet, type IconTool } from '../iconSets';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Buttons and icons: the same tools in Paint's own `SketchIcon` and in free icon sets (see `iconSets`), first in
 * Studio's tool rail, then larger with their names. Only the icons differ; the buttons are Studio's.
 */
export function Icons() {
  const sets = [paintSet, ...iconSets.map(fromSet)];

  return (
    <CanvasGroup
      id="icons"
      title="Icons"
      omitted={
        <>
          Lucide has no gradient icon (an empty button stands in). Mixer brush has no common symbol: Paint uses a
          feather, the sets a drop or two blended circles. Licenses: Lucide ISC, Phosphor MIT, Material Symbols Apache
          2.0; their notices are in `iconSets.ts`.
        </>
      }
    >
      <CanvasRow title="Tool rail" note="Studio's buttons, 20 px icons">
        <For each={sets}>
          {(set) => (
            <Specimen id={`icons/rail/${set.id}`} label={set.name}>
              <ToolRail set={set} />
            </Specimen>
          )}
        </For>
      </CanvasRow>

      <CanvasRow title="With names" note="28 px">
        <For each={sets}>
          {(set) => (
            <Specimen id={`icons/named/${set.id}`} label={set.name}>
              <div class={styles.namedIcons}>
                <For each={iconTools}>
                  {(tool) => (
                    <span class={styles.namedIcon}>
                      {set.icon(tool.id, 28)}
                      <small>{tool.label}</small>
                    </span>
                  )}
                </For>
              </div>
            </Specimen>
          )}
        </For>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's left tool rail with every tool of `set`; a press chooses the tool, as in Paint. */
function ToolRail(props: { set: DrawnSet }) {
  const [tool, setTool] = createSignal<IconTool>('brush');

  return (
    <nav class={styles.rail} aria-label={`${props.set.name} tools`}>
      <For each={iconTools}>
        {(entry) => (
          <button
            aria-label={entry.label}
            title={entry.label}
            aria-pressed={tool() === entry.id ? 'true' : 'false'}
            onClick={() => setTool(entry.id)}
          >
            {props.set.icon(entry.id, 20)}
          </button>
        )}
      </For>
    </nav>
  );
}

/** An icon set as the group draws it: its name and a function that draws a tool's icon at a size. */
type DrawnSet = { id: string; name: string; icon: (tool: IconTool, size: number) => ReturnType<typeof SketchIcon> };

/** Paint's own icons, as Studio's tool rail and the tile cluster use them. */
const paintSet: DrawnSet = {
  id: 'sketch',
  name: 'Paint (SketchIcon)',
  icon: (tool, size) => <SketchIcon name={sketchNames[tool]} size={size} />
};

const sketchNames: Record<IconTool, SketchIconName> = {
  brush: 'draw',
  mixer: 'feather',
  eraser: 'erase',
  lasso: 'lasso',
  transform: 'move',
  symmetry: 'symmetry',
  fill: 'fill',
  gradient: 'gradient',
  picker: 'picker'
};

/** Draws a free set's icons with `currentColor`, as lines or filled shapes as the set is drawn. */
function fromSet(set: IconSet): DrawnSet {
  return {
    id: set.id,
    name: `${set.name} (${set.license})`,
    icon: (tool, size) => (
      <Show when={set.icons[tool]} fallback={<span style={{ width: `${size}px`, height: `${size}px` }} />}>
        {(icon) => (
          <svg
            width={size}
            height={size}
            viewBox={icon().viewBox}
            fill={set.style === 'fill' ? 'currentColor' : 'none'}
            stroke={set.style === 'stroke' ? 'currentColor' : undefined}
            stroke-width={set.style === 'stroke' ? 2 : undefined}
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            innerHTML={icon().markup}
          />
        )}
      </Show>
    )
  };
}
