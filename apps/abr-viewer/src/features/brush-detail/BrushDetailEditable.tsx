import { descriptorColorClipped, record } from '@app-game/abr-brush/form';
import { supportsAirbrush } from '@app-game/abr-brush/stroke';
import {
  createEffect,
  createMemo,
  createSignal,
  createStore,
  For,
  Match,
  onSettled,
  Show,
  Switch,
  untrack,
  type StoreSetter
} from 'solid-js';
import type { BrushWithPreview } from '../../lib/abr';
import { brushTipToPngBlob } from '../../lib/abr';
import { brushFormSchema, brushToFormValues, formValuesToBrush, type BrushFormValues } from './brush-form-schema';
import { chooseDualTip, choosePattern } from './brush-resources';
import type { ColorMixingPreference } from './color-mixing';
import { ColorProfileControl, useColorProfile } from './ColorProfile';
import { BrushPreviewCanvas } from './components/panel-components/BrushPreviewCanvas';
import { BrushTipPanel } from './components/panel-components/BrushTipPanel';
import { RawSettingsPanel } from './components/panel-components/RawSettingsPanel';
import { DualBrushPicker, TexturePicker } from './components/panel-components/ResourcePickers';
import { SettingsPanel } from './components/panel-components/SettingsPanel';
import { ToolOptionsBar } from './components/panel-components/ToolOptionsBar';
import { sanitizeFilename } from './helper-functions/sanitizeFilename';

/** Docked settings editor. Valid changes immediately update the workspace; selection and undo resync the form. */
export function BrushDetailEditable(props: {
  brush: BrushWithPreview;
  /** Shared across brush selection; changing it does not dirty the preset. */
  colorMixing?: ColorMixingPreference;
  brushes?: BrushWithPreview[];
  onChange: (brush: BrushWithPreview) => void;
}) {
  const colors = useColorProfile();
  let inspector!: HTMLDivElement;
  const [requestedHeight, setRequestedHeight] = createSignal(260);
  const [maximumHeight, setMaximumHeight] = createSignal(600);
  const previewHeight = () => Math.min(requestedHeight(), maximumHeight());
  const resizePreview = (height: number) =>
    setRequestedHeight(Math.round(Math.max(120, Math.min(maximumHeight(), height))));
  let dragStart = { y: 0, height: 260 };
  onSettled(() => {
    const observer = new ResizeObserver(() =>
      setMaximumHeight(Math.max(120, Math.min(700, inspector.clientHeight - 220)))
    );
    observer.observe(inspector);
    return () => observer.disconnect();
  });
  const [foreground, setForeground] = createSignal('#dedede');
  const [background, setBackground] = createSignal('#477ca6');
  const [category, setCategory] = createSignal('brush-tip');
  const [error, setError] = createSignal('');
  const [downloading, setDownloading] = createSignal(false);
  const [values, setValues] = createStore<BrushFormValues>(
    untrack(() => brushToFormValues(props.brush, colors?.converter()))
  );
  createEffect(
    () => brushToFormValues(props.brush, colors?.converter()),
    (next) => {
      setValues((draft) => Object.assign(draft, next));
      setError('');
    }
  );
  const update: StoreSetter<BrushFormValues> = (edit) => {
    // Solid publishes store writes after the event. Validate the new draft directly.
    const draft = untrack(() => brushToFormValues(props.brush, colors?.converter()));
    const next = edit(draft) ?? draft;
    setValues((current) => Object.assign(current, next));
    const result = brushFormSchema.safeParse(next);
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'Check the entered value');
      return;
    }
    setError('');
    props.onChange(untrack(() => formValuesToBrush(props.brush, result.data, colors?.converter())));
  };
  const patterns = createMemo(() => [
    ...new Map(
      [props.brush, ...(props.brushes ?? [])]
        .flatMap((brush) => brush.patternResources ?? [])
        .map((pattern) => [pattern.id, pattern])
    ).values()
  ]);
  const selected = createMemo(() => categories.find((item) => item.id === category()) ?? categories[0]!);
  const hasCmyk = () => {
    const tool = record(props.brush.settings.toolOptions);
    return [tool.FrgC, tool.BckC].some((value) => record(value).__classId === 'CMYC');
  };
  const clippedColor = () => {
    const tool = record(props.brush.settings.toolOptions);
    return descriptorColorClipped(tool.FrgC) || descriptorColorClipped(tool.BckC);
  };

  async function downloadTip() {
    if (!props.brush.brushTip) return;
    setDownloading(true);
    try {
      const url = URL.createObjectURL(await brushTipToPngBlob(props.brush.brushTip));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFilename(props.brush.name)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not export the brush tip.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div ref={inspector} data-abr-brush-detail class="abr-inspector">
      <div class="abr-brush-name">
        <input
          aria-label="Brush name"
          value={values.name}
          onInput={(event) =>
            update((draft) => {
              draft.name = event.currentTarget.value;
            })
          }
        />
        <span>
          {values.tipKind === 'sampledBrush'
            ? 'Sampled tip'
            : values.tipKind === 'dBrush'
              ? 'Bristle tip'
              : values.tipKind === 'dTips'
                ? 'Physical tip'
                : 'Round tip'}
        </span>
      </div>
      <ToolOptionsBar colorMixing={props.colorMixing} values={values} setValues={update} onSettings={setCategory} />
      <Show when={error()}>
        <p class="abr-validation" role="alert">
          {error()}
        </p>
      </Show>
      <div class="abr-settings-body">
        <nav class="abr-categories" aria-label="Settings categories">
          <For each={categories}>
            {(item) => (
              <div class={`abr-category ${category() === item.id ? 'is-active' : ''}`}>
                <Show when={item.field}>
                  {(field) => (
                    <input
                      type="checkbox"
                      aria-label={`Enable ${item.label}`}
                      checked={values[field()]}
                      disabled={
                        (field() === 'useTexture' && !values.useTexture && !patterns().length) ||
                        (field() === 'useBuildUp' && !supportsAirbrush(values.tool))
                      }
                      title={
                        field() === 'useTexture' && !patterns().length
                          ? 'Import an ABR containing texture patterns to enable Texture.'
                          : undefined
                      }
                      onChange={(event) => {
                        if (
                          field() === 'useTexture' &&
                          event.currentTarget.checked &&
                          !values.texture.patternId &&
                          patterns()[0]
                        ) {
                          props.onChange(
                            choosePattern(
                              formValuesToBrush(
                                props.brush,
                                { ...brushToFormValues(props.brush, colors?.converter()), useTexture: true },
                                colors?.converter()
                              ),
                              patterns()[0]!
                            )
                          );
                          return;
                        }
                        update((draft) => {
                          draft[field()] = event.currentTarget.checked;
                        });
                      }}
                    />
                  )}
                </Show>
                <button aria-pressed={category() === item.id ? 'true' : 'false'} onClick={() => setCategory(item.id)}>
                  {item.label}
                </button>
              </div>
            )}
          </For>
        </nav>
        <div class="abr-settings-controls">
          <h3>{selected().label}</h3>
          <Switch>
            <Match when={category() === 'tool'}>
              <Show when={hasCmyk() || colors?.profile()}>
                <ColorProfileControl />
              </Show>
              <SettingsPanel group="tool" values={values} setValues={update} mixer={values.tool.type === 'MixB'} />
              <Show when={clippedColor()}>
                <p class="abr-feature-note">
                  A saved Lab color is outside sRGB. Its displayed color may differ from Photoshop; the original Lab
                  value is preserved on export.
                </p>
              </Show>
              <p class="abr-feature-note">
                Saved with the preset. Tool algorithms and compatibility vary between hosts.
              </p>
            </Match>
            <Match when={category() === 'brush-tip'}>
              <BrushTipPanel
                brush={props.brush}
                values={values}
                setValues={update}
                onDownload={downloadTip}
                downloading={downloading()}
              />
              <Show when={values.tipKind === 'dBrush'}>
                <SettingsPanel group="bristle" values={values} setValues={update} />
                <p class="abr-feature-note">
                  Bristle preview is approximate; Photoshop’s physical brush simulation may differ.
                </p>
              </Show>
              <Show when={values.tipKind === 'dTips'}>
                <SettingsPanel group="erodible" values={values} setValues={update} />
                <p class="abr-feature-note">
                  Tip wear is preserved on export. This preview approximates the tip shape.
                </p>
              </Show>
            </Match>
            <Match when={category() === 'shape-dynamics'}>
              <fieldset disabled={!values.useShapeDynamics}>
                <SettingsPanel group="shapeDynamics" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'scattering'}>
              <fieldset disabled={!values.useScattering}>
                <SettingsPanel group="scattering" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'transfer'}>
              <fieldset disabled={!values.useTransfer}>
                <SettingsPanel
                  group="transfer"
                  values={values}
                  setValues={update}
                  mixer={['MixB', 'mixerBrushTool'].includes(values.tool.type)}
                />
              </fieldset>
            </Match>
            <Match when={category() === 'raw'}>
              <RawSettingsPanel settings={props.brush.settings ?? {}} />
            </Match>
            <Match when={category() === 'texture'}>
              <fieldset disabled={!values.useTexture}>
                <TexturePicker
                  patterns={patterns()}
                  selectedId={values.texture.patternId}
                  selectedName={values.texture.patternName}
                  disabled={!values.useTexture}
                  onSelect={(pattern) => props.onChange(choosePattern(props.brush, pattern))}
                />
                <SettingsPanel group="texture" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'dual-brush'}>
              <fieldset disabled={!values.useDualBrush}>
                <DualBrushPicker
                  brush={props.brush}
                  brushes={props.brushes ?? []}
                  onSelect={(source) => props.onChange(chooseDualTip(props.brush, source))}
                />
                <SettingsPanel group="dualBrush" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'color-dynamics'}>
              <fieldset disabled={!values.useColorDynamics}>
                <SettingsPanel group="colorDynamics" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'brush-pose'}>
              <fieldset disabled={!values.useBrushPose}>
                <SettingsPanel group="brushPose" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={category() === 'smoothing'}>
              <fieldset disabled={!values.useSmoothing}>
                <SettingsPanel group="smoothing" values={values} setValues={update} />
              </fieldset>
            </Match>
            <Match when={true}>
              <div class="abr-feature-note">
                <p>
                  {category() === 'noise'
                    ? 'Adds grain to soft edges. Most visible on a soft round tip.'
                    : category() === 'wet-edges'
                      ? 'Concentrates paint near the edge of the stroke.'
                      : category() === 'build-up'
                        ? supportsAirbrush(values.tool)
                          ? 'Paint accumulates while the pen stays in one place. Also available as Airbrush in Tool Options.'
                          : 'Build-up is inactive for this tool. Its saved setting is retained when switching tools.'
                        : 'Keeps the texture consistent when switching painting tools in Photoshop. Saved with the preset.'}
                </p>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
      <div
        role="separator"
        aria-label="Stroke preview height"
        aria-orientation="horizontal"
        aria-valuemin={120}
        aria-valuemax={maximumHeight()}
        aria-valuenow={previewHeight()}
        aria-valuetext={`${previewHeight()} pixels`}
        tabindex="0"
        class="abr-preview-divider"
        title="Drag to resize stroke preview. Double-click to reset."
        onDblClick={() => resizePreview(260)}
        onKeyDown={(event) => {
          if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            resizePreview(
              event.key === 'Home'
                ? 120
                : event.key === 'End'
                  ? maximumHeight()
                  : previewHeight() + (event.key === 'ArrowUp' ? 20 : -20)
            );
          }
        }}
        onPointerDown={(event) => {
          dragStart = { y: event.clientY, height: previewHeight() };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            resizePreview(dragStart.height + dragStart.y - event.clientY);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      />
      <div class="abr-stroke-preview">
        <div class="abr-preview-tools">
          <label>
            Foreground{' '}
            <input
              aria-label="Preview foreground"
              type="color"
              value={values.tool.foreground || foreground()}
              disabled={Boolean(values.tool.foreground)}
              title={values.tool.foreground ? 'Edit the saved foreground in Tool Options' : 'Local preview color'}
              onInput={(event) => setForeground(event.currentTarget.value)}
            />
          </label>
          <label>
            Background{' '}
            <input
              aria-label="Preview background paint"
              type="color"
              value={values.tool.background || background()}
              disabled={Boolean(values.tool.background)}
              title={values.tool.background ? 'Edit the saved background in Tool Options' : 'Local preview color'}
              onInput={(event) => setBackground(event.currentTarget.value)}
            />
          </label>
          <span>Drag to test · tablet pressure and tilt supported</span>
        </div>
        <BrushPreviewCanvas
          colorMixing={props.colorMixing?.value}
          brush={props.brush}
          values={values}
          height={previewHeight()}
          priority={10}
          backgroundColor="#414141"
          brushColor={foreground()}
          secondaryColor={background()}
          interactive
        />
        <span>Stroke preview</span>
      </div>
    </div>
  );
}

/** Feature switches supported by the existing descriptor editor. */
type FeatureField = {
  [K in keyof BrushFormValues]: BrushFormValues[K] extends boolean ? K : never;
}[keyof BrushFormValues];
const categories: { id: string; label: string; field?: FeatureField }[] = [
  { id: 'tool', label: 'Tool Options' },
  { id: 'brush-tip', label: 'Brush Tip Shape' },
  { id: 'shape-dynamics', label: 'Shape Dynamics', field: 'useShapeDynamics' },
  { id: 'scattering', label: 'Scattering', field: 'useScattering' },
  { id: 'texture', label: 'Texture', field: 'useTexture' },
  { id: 'dual-brush', label: 'Dual Brush', field: 'useDualBrush' },
  { id: 'color-dynamics', label: 'Color Dynamics', field: 'useColorDynamics' },
  { id: 'transfer', label: 'Transfer', field: 'useTransfer' },
  { id: 'brush-pose', label: 'Brush Pose', field: 'useBrushPose' },
  { id: 'noise', label: 'Noise', field: 'useNoise' },
  { id: 'wet-edges', label: 'Wet Edges', field: 'useWetEdges' },
  { id: 'build-up', label: 'Build-up', field: 'useBuildUp' },
  { id: 'smoothing', label: 'Smoothing', field: 'useSmoothing' },
  { id: 'protect-texture', label: 'Protect Texture', field: 'useProtectTexture' },
  { id: 'raw', label: 'Raw Settings' }
];
