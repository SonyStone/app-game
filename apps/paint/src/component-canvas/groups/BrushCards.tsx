import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { ok } from 'neverthrow';
import { createSignal, untrack } from 'solid-js';
import { BrushLibraryPanel } from '../../features/brush';
import {
  applyPreset,
  builtInPresets,
  defaultPresetGroups,
  presetChanges,
  presetSettings,
  type BrushPreset
} from '../../features/brush-library';
import { BrushOpacityPopup, BrushSizePopup, type OpacityTarget } from '../../variants/infinite/BrushPopups';
import { BrushSelector } from '../../variants/infinite/BrushSelector';
import { BrushLibrary } from '../../variants/procreate/BrushLibrary';
import { PresetStroke } from '../../variants/puck/PresetStroke';
import { PresetChooser } from '../../variants/zen/PresetChooser';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, InfiniteFrame, ZenFrame } from '../frames';
import { ProcreateFrame } from '../ProcreateFrame';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';
import { TestStrip } from '../TestStrip';

/**
 * Brushes: the same presets in every style of brush card, each with a test strip that paints the chosen preset in
 * black: Studio's brush panel, the Procreate variant's library and the Infinite Painter variant's selector and brush
 * pop-ups (see the group's note for the styles still missing).
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
          presets, Soft round and Eraser; the user's own and ABR presets live in each address's storage, so the Infinite
          Painter row adds a few sample presets to fill its folders, and the test strip paints only the round brush.
        </>
      }
    >
      <CanvasRow title="Brush cards" note="Paint's own presets">
        <StudioBrushPanel />
        <ProcreateLibrary />
        <ZenChooser />
      </CanvasRow>

      <CanvasRow
        title="Infinite Painter"
        note="the brush selector with sample presets, and the toolbar's Size and Opacity pop-ups; a tapped name in red is what the Opacity button drags"
      >
        <InfiniteSelector id="brush-cards/infinite/selector" label="Brush selector" strip />
        <InfiniteSelector id="brush-cards/infinite/selector-recent" label="Brush selector on Recent" folder="recent" />
        <InfiniteSizePopup />
        <InfiniteOpacityPopup target="opacity" strip />
        <InfiniteOpacityPopup target="flow" />
        <InfiniteOpacityPopup target="softness" />
      </CanvasRow>

      <CanvasRow title="Stroke previews" note="the sample stroke the Puck and Desktop variants draw for a preset">
        <Specimen id="brush-cards/strokes/preset-stroke" label="Preset stroke (Puck, Desktop)">
          <DesktopFrame width={300}>
            <div class={styles.strokeList}>
              {builtInPresets.map((preset) => (
                <div>
                  <span>{preset.name}</span>
                  <PresetStroke preset={preset} resources={noResources} color="#e8e8e8" height={34} />
                </div>
              ))}
            </div>
          </DesktopFrame>
        </Specimen>
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
      part="procreate-brushes"
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

/** The Zen variant's chooser for a fan slot: its default tool or one of Paint's presets. */
function ZenChooser() {
  const [preset, setPreset] = createSignal<string>();

  return (
    <Specimen id="brush-cards/zen/chooser" label="Zen slot chooser">
      <ZenFrame width={320}>
        <PresetChooser
          shape="brush"
          presets={builtInPresets}
          current={preset()}
          color="#1d1d1f"
          resources={noResources}
          disabled={false}
          onDefault={() => setPreset(undefined)}
          onChoose={(chosen) => setPreset(chosen.id)}
        />
      </ZenFrame>
    </Specimen>
  );
}

/**
 * The Infinite Painter variant's brush selector on Paint's presets and the sample ones, opening on the current brush's
 * folder or on `folder`; hearts mark favorites for this specimen only. `strip` adds a test strip of the chosen brush.
 */
function InfiniteSelector(props: { id: string; label: string; folder?: 'recent'; strip?: boolean }) {
  const [preset, setPreset] = createSignal(builtInPresets[0]!.id);
  const [recent, setRecent] = createSignal<readonly string[]>(['sample:ink', 'sample:chalk', 'builtin:soft-round']);
  const [favorites, setFavorites] = createSignal<readonly string[]>(['sample:pencil']);
  const brush = () => strokeBrush(applyPreset(defaultBrush(), infinitePresets.find((entry) => entry.id === preset())!));

  return (
    <Specimen
      id={props.id}
      label={props.label}
      below={props.strip ? <TestStrip brush={brush()} width={infiniteSelectorWidth} /> : undefined}
    >
      <InfiniteFrame>
        <BrushSelector
          presets={infinitePresets}
          recent={recent()}
          preset={preset()}
          favorites={favorites()}
          initialFolder={props.folder}
          onFavorite={(id) =>
            setFavorites((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [id, ...list]))
          }
          onChoose={(id) => {
            setPreset(id);
            setRecent((list) => [id, ...list.filter((entry) => entry !== id)].slice(0, 8));
          }}
          onImport={() => {}}
          onEdit={() => {}}
        />
      </InfiniteFrame>
    </Specimen>
  );
}

/** The Infinite Painter variant's Size pop-up on a small soft round brush, with a test strip. */
function InfiniteSizePopup() {
  const [brush, setBrush] = createSignal<Brush>({ ...strokeBrush(defaultBrush()), size: 4.7 });

  return (
    <Specimen
      id="brush-cards/infinite/size-popup"
      label="Size pop-up"
      below={<TestStrip brush={brush()} width={infinitePopupWidth} />}
    >
      <InfiniteFrame>
        <BrushSizePopup
          brush={brush()}
          onChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
          onEdit={() => {}}
        />
      </InfiniteFrame>
    </Specimen>
  );
}

/** The Infinite Painter variant's Opacity pop-up with `target` highlighted at first; `strip` adds a test strip. */
function InfiniteOpacityPopup(props: { target: OpacityTarget; strip?: boolean }) {
  const [brush, setBrush] = createSignal<Brush>({ ...strokeBrush(defaultBrush()), opacity: 0.95, flow: 1 });
  // Starts on the specimen's own target, then follows the tapped names.
  const [target, setTarget] = createSignal<OpacityTarget>(untrack(() => props.target));

  return (
    <Specimen
      id={`brush-cards/infinite/opacity-popup-${props.target}`}
      label={`Opacity pop-up, ${props.target} in red`}
      below={props.strip ? <TestStrip brush={brush()} width={infinitePopupWidth} /> : undefined}
    >
      <InfiniteFrame>
        <BrushOpacityPopup
          brush={brush()}
          onChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
          target={target()}
          onTarget={setTarget}
          onEdit={() => {}}
        />
      </InfiniteFrame>
    </Specimen>
  );
}

/**
 * Paint's presets with a few samples of the kinds Infinite Painter ships, so that the selector's folders have
 * something to list: four round brushes in My brushes and a stamped chalk in Imported.
 */
const infinitePresets: readonly BrushPreset[] = [
  ...builtInPresets,
  samplePreset('sample:pencil', 'Pencil', { size: 3, hardness: 1, flow: 0.8, spacing: 0.08 }),
  samplePreset('sample:ink', 'Ink pen', { size: 9, hardness: 1, flow: 1 }),
  samplePreset('sample:marker', 'Marker', { size: 26, hardness: 0.9, opacity: 0.6, pressureSize: false }),
  samplePreset('sample:airbrush', 'Airbrush', { size: 140, hardness: 0, flow: 0.12 }),
  {
    ...samplePreset('sample:chalk', 'Chalk', { size: 22, spacing: 0.5, engine: { id: 'abr', settings: {} } }),
    source: 'sample.abr#chalk'
  }
];

/** A user preset of the round brush with `changes` over the default brush. */
function samplePreset(id: string, name: string, changes: Partial<Brush>): BrushPreset {
  return {
    id,
    name,
    settings: presetSettings({ ...defaultBrush(), ...changes }, defaultPresetGroups),
    resourceIds: []
  };
}

/** Paint's built-in presets have no tip images to read. */
const noResources = async () => ok([]);

/** A preset's brush as a test strip paints it: in black on Paint's paper. */
function strokeBrush(brush: Brush): Brush {
  return { ...brush, color: '#000000' };
}

/** Studio's panel width, which the strip under the panel matches. */
const studioPanelWidth = 284;
/** The Procreate variant's Brush Library popover width. */
const procreateLibraryWidth = 470;
/** The Infinite Painter brush selector's width in its frame, which its test strip matches. */
const infiniteSelectorWidth = 292 + 40;
/** The Infinite Painter brush pop-ups' width in their frame, which their test strips match. */
const infinitePopupWidth = 236 + 40;
