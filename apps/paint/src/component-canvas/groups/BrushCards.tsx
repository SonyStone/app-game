import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createSignal } from 'solid-js';
import { BrushLibraryPanel } from '../../features/brush';
import { applyPreset, builtInPresets, presetChanges } from '../../features/brush-library';
import { BrushLibrary } from '../../variants/procreate/BrushLibrary';
import styles from '../ComponentCanvas.module.css';
import { ProcreateFrame } from '../ProcreateFrame';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import { TestStrip } from '../TestStrip';

/**
 * Brushes: the same presets in every style of brush card, each with a test strip that paints the chosen preset in
 * black: Studio's brush panel and the Procreate variant's library (see the group's note for the styles still missing).
 */
export function BrushCards() {
  return (
    <CanvasGroup
      id="brush-cards"
      title="Brushes"
      omitted={
        <>
          Not here: the Desktop variant's list and the Puck variant's cards read the drawing session itself, so they
          need unbinding first; so does the ABR viewer's card (two columns, a wide stroke over grey stripes), which
          reads the viewer's parsed ABR files and its preview worker. No CLIP STUDIO card exists yet. Paint ships two
          presets, Soft round and Eraser; the user's own and ABR presets live in each address's storage, and the test
          strip paints only the round brush.
        </>
      }
    >
      <CanvasRow title="Brush cards" note="Paint's own presets">
        <StudioBrushPanel />
        <ProcreateLibrary />
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's brush panel on Paint's built-in presets; saving, renaming and deleting do nothing here. */
function StudioBrushPanel() {
  const [preset, setPreset] = createSignal(builtInPresets[0]!.id);
  const [brush, setBrush] = createSignal<Brush>(strokeBrush(applyPreset(defaultBrush(), builtInPresets[0]!)));
  const [sharedSize, setSharedSize] = createSignal(false);
  const find = (id: string) => builtInPresets.find((entry) => entry.id === id);

  return (
    <Specimen
      id="brush-cards/studio/panel"
      label="Brush panel"
      below={<TestStrip brush={brush()} width={studioPanelWidth} />}
    >
      <div class={styles.studioPanel}>
        <BrushLibraryPanel
          presets={builtInPresets}
          preset={preset()}
          changed={(id) => id === preset() && Object.keys(presetChanges(find(id)!, brush())).length > 0}
          brush={brush()}
          disabled={false}
          onChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
          onSelect={(id) => {
            const chosen = find(id);
            if (chosen) {
              setPreset(id);
              setBrush((current) => strokeBrush(applyPreset(current, chosen, {}, sharedSize() ? ['size'] : [])));
            }
          }}
          onReset={(id) => {
            const chosen = find(id);
            if (chosen) {
              setBrush((current) => strokeBrush(applyPreset(current, chosen)));
            }
          }}
          onSave={() => {}}
          onSaveAs={() => {}}
          onRename={() => {}}
          onDelete={() => {}}
          sharedSize={sharedSize()}
          onSharedSizeChange={setSharedSize}
        />
      </div>
    </Specimen>
  );
}

/** The Procreate variant's Brush Library on Paint's presets: wide cards beside a column of sets. */
function ProcreateLibrary() {
  const [preset, setPreset] = createSignal(builtInPresets[0]!.id);
  const [recent, setRecent] = createSignal<readonly string[]>([]);
  const brush = () => strokeBrush(applyPreset(defaultBrush(), builtInPresets.find((entry) => entry.id === preset())!));

  return (
    <Specimen
      id="brush-cards/procreate/library"
      label="Procreate library"
      below={<TestStrip brush={brush()} width={procreateLibraryWidth + 40} />}
    >
      <ProcreateFrame width={procreateLibraryWidth} label="Brush Library">
        <BrushLibrary
          title="Brush Library"
          presets={builtInPresets}
          recent={recent()}
          preset={preset()}
          disabled={false}
          onChoose={(id) => {
            setPreset(id);
            setRecent((list) => [id, ...list.filter((entry) => entry !== id)].slice(0, 8));
          }}
        />
      </ProcreateFrame>
    </Specimen>
  );
}

/** A preset's brush as a test strip paints it: in black on Paint's paper. */
function strokeBrush(brush: Brush): Brush {
  return { ...brush, color: '#000000' };
}

/** Studio's panel width, which the strip under the panel matches. */
const studioPanelWidth = 284;
/** The Procreate variant's Brush Library popover width. */
const procreateLibraryWidth = 470;
