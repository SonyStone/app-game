import { ComponentProps, createMemo, createSignal, For, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { BrushWithPreview } from '~/lib/abr';
import { brushTipToPngBlob } from '~/lib/abr';
import {
  brushFormSchema,
  brushToFormValues,
  formValuesToBrush,
  type BrushFormValues
} from './brush-form-schema';
import { CollapsibleSection } from './components/CollapsibleSection';
import { BrushTipPanel } from './components/panel-components/BrushTipPanel';
import { RawSettingsPanel } from './components/panel-components/RawSettingsPanel';
import { ScatteringPanel } from './components/panel-components/ScatteringPanel';
import { ShapeDynamicsPanel } from './components/panel-components/ShapeDynamicsPanel';
import { TransferPanel } from './components/panel-components/TransferPanel';
import { sanitizeFilename } from './helper-functions/sanitizeFilename';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'brush-detail-editable': ComponentProps<'div'>;
    }
  }
}

export function BrushDetailEditable(props: {
  brush: BrushWithPreview;
  onClose: () => void;
  onSave?: (brush: BrushWithPreview) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const [downloading, setDownloading] = createSignal(false);
  const [validationErrors, setValidationErrors] = createSignal<string[]>([]);
  let scrollContainerRef: HTMLDivElement | undefined;

  // Initialize store from brush
  const initialValues = brushToFormValues(props.brush);
  const [formValues, setFormValues] = createStore<BrushFormValues>(initialValues);

  // Track if form has been modified
  const [initialSnapshot] = createSignal(JSON.stringify(initialValues));
  const hasChanges = createMemo(() => JSON.stringify(formValues) !== initialSnapshot());

  // Scroll to a section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element && scrollContainerRef) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Panel configuration
  const panels = createMemo(() => [
    { id: 'brush-tip', label: 'Brush Tip Shape', always: true },
    { id: 'shape-dynamics', label: 'Shape Dynamics', field: 'useShapeDynamics' as const },
    { id: 'scattering', label: 'Scattering', field: 'useScattering' as const },
    { id: 'texture', label: 'Texture', field: 'useTexture' as const },
    { id: 'dual-brush', label: 'Dual Brush', field: 'useDualBrush' as const },
    { id: 'color-dynamics', label: 'Color Dynamics', field: 'useColorDynamics' as const },
    { id: 'transfer', label: 'Transfer', field: 'useTransfer' as const },
    { id: 'brush-pose', label: 'Brush Pose', field: 'useBrushPose' as const },
    { id: 'noise', label: 'Noise', field: 'useNoise' as const },
    { id: 'wet-edges', label: 'Wet Edges', field: 'useWetEdges' as const },
    { id: 'build-up', label: 'Build-up', field: 'useBuildUp' as const },
    { id: 'smoothing', label: 'Smoothing', field: 'useSmoothing' as const },
    { id: 'protect-texture', label: 'Protect Texture', field: 'useProtectTexture' as const },
    { id: 'raw', label: 'Raw Settings', always: true }
  ]);

  const handleDownloadImage = async () => {
    if (!props.brush.brushTip) return;
    setDownloading(true);
    try {
      const blob = await brushTipToPngBlob(props.brush.brushTip);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(formValues.name)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = () => {
    if (!props.onSave) return;

    // Validate with Zod
    const result = brushFormSchema.safeParse(formValues);
    if (!result.success) {
      setValidationErrors(result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
      return;
    }

    setValidationErrors([]);
    const updatedBrush = formValuesToBrush(props.brush, formValues);
    props.onSave(updatedBrush);
  };

  // Toggle helper for feature flags
  const toggleFeature = (field: keyof BrushFormValues) => {
    setFormValues(field as any, !formValues[field]);
  };

  return (
    <brush-detail-editable
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={props.onClose}
    >
      <div
        class="bg-ps-bg shadow-ps-lg flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="border-ps-border bg-ps-bg-dark flex items-center justify-between border-b p-4">
          <div class="flex items-center gap-3">
            <div class="bg-ps-accent/20 flex h-8 w-8 items-center justify-center rounded">
              <svg class="text-ps-accent h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </div>
            <div>
              <input
                type="text"
                value={formValues.name}
                onInput={(e) => setFormValues('name', e.currentTarget.value)}
                class="text-ps-text-bright hover:border-ps-border focus:border-ps-accent -ml-1 border-b border-transparent bg-transparent px-1 text-lg font-medium focus:outline-none"
              />
              <p class="text-ps-text-muted text-xs">
                {props.brush.type === 'computed' ? 'Computed Brush' : 'Sampled Brush'} • ID: {props.brush.id}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={props.onSave}>
              <button
                onClick={handleSave}
                disabled={!hasChanges()}
                class={`flex items-center gap-2 rounded px-3 py-1.5 text-sm ${
                  hasChanges()
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-ps-bg-light text-ps-text-muted cursor-not-allowed'
                }`}
                title="Save Changes"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Save
              </button>
            </Show>
            <Show when={props.onDuplicate}>
              <button
                onClick={props.onDuplicate}
                class="bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded p-2 text-sm"
                title="Duplicate Brush"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </Show>
            <Show when={props.onDelete}>
              <button
                onClick={props.onDelete}
                class="rounded bg-red-600/20 p-2 text-sm text-red-400 hover:bg-red-600/30"
                title="Delete Brush"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </Show>
            <button onClick={props.onClose} class="hover:bg-ps-bg-light ml-2 rounded p-2" aria-label="Close">
              <svg class="text-ps-text-muted h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Validation Errors */}
        <Show when={validationErrors().length > 0}>
          <div class="border-red-500 bg-red-500/10 border-b p-2">
            <For each={validationErrors()}>
              {(error) => <p class="text-sm text-red-400">{error}</p>}
            </For>
          </div>
        </Show>

        {/* Content */}
        <div class="flex flex-1 overflow-hidden">
          {/* Left Panel - Feature Toggles */}
          <div class="bg-ps-bg-dark border-ps-border w-52 flex-shrink-0 overflow-y-auto border-r">
            <For each={panels()}>
              {(panel) => (
                <button
                  onClick={() => scrollToSection(panel.id)}
                  class="text-ps-text hover:bg-ps-bg-light/50 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Show when={!panel.always && panel.field}>
                    <input
                      type="checkbox"
                      checked={formValues[panel.field!] as boolean}
                      onChange={() => toggleFeature(panel.field!)}
                      onClick={(e) => e.stopPropagation()}
                      class="border-ps-border bg-ps-bg-dark checked:bg-ps-accent checked:border-ps-accent h-4 w-4 rounded"
                    />
                  </Show>
                  <Show when={panel.always}>
                    <div class="w-4" />
                  </Show>
                  <span class={!panel.always && panel.field && !formValues[panel.field] ? 'opacity-50' : ''}>
                    {panel.label}
                  </span>
                </button>
              )}
            </For>
          </div>

          {/* Right Panel - Settings Content */}
          <div ref={scrollContainerRef} class="flex-1 space-y-2 overflow-y-auto p-4">
            {/* Brush Tip Shape */}
            <CollapsibleSection id="brush-tip" title="Brush Tip Shape" defaultOpen={true}>
              <BrushTipPanel
                brush={props.brush}
                values={formValues}
                setValues={setFormValues}
                onDownload={handleDownloadImage}
                downloading={downloading()}
              />
            </CollapsibleSection>

            {/* Shape Dynamics */}
            <CollapsibleSection
              id="shape-dynamics"
              title="Shape Dynamics"
              enabled={formValues.useShapeDynamics}
              defaultOpen={formValues.useShapeDynamics}
              onToggleEnabled={(v) => setFormValues('useShapeDynamics', v)}
            >
              <ShapeDynamicsPanel values={formValues.shapeDynamics} setValues={setFormValues} />
            </CollapsibleSection>

            {/* Scattering */}
            <CollapsibleSection
              id="scattering"
              title="Scattering"
              enabled={formValues.useScattering}
              defaultOpen={formValues.useScattering}
              onToggleEnabled={(v) => setFormValues('useScattering', v)}
            >
              <ScatteringPanel values={formValues.scattering} setValues={setFormValues} />
            </CollapsibleSection>

            {/* Texture */}
            <CollapsibleSection
              id="texture"
              title="Texture"
              enabled={formValues.useTexture}
              defaultOpen={formValues.useTexture}
              onToggleEnabled={(v) => setFormValues('useTexture', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">Texture settings coming soon</div>
            </CollapsibleSection>

            {/* Dual Brush */}
            <CollapsibleSection
              id="dual-brush"
              title="Dual Brush"
              enabled={formValues.useDualBrush}
              defaultOpen={formValues.useDualBrush}
              onToggleEnabled={(v) => setFormValues('useDualBrush', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">Dual Brush settings coming soon</div>
            </CollapsibleSection>

            {/* Color Dynamics */}
            <CollapsibleSection
              id="color-dynamics"
              title="Color Dynamics"
              enabled={formValues.useColorDynamics}
              defaultOpen={formValues.useColorDynamics}
              onToggleEnabled={(v) => setFormValues('useColorDynamics', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">Color Dynamics settings coming soon</div>
            </CollapsibleSection>

            {/* Transfer */}
            <CollapsibleSection
              id="transfer"
              title="Transfer"
              enabled={formValues.useTransfer}
              defaultOpen={formValues.useTransfer}
              onToggleEnabled={(v) => setFormValues('useTransfer', v)}
            >
              <TransferPanel values={formValues.transfer} setValues={setFormValues} />
            </CollapsibleSection>

            {/* Brush Pose */}
            <CollapsibleSection
              id="brush-pose"
              title="Brush Pose"
              enabled={formValues.useBrushPose}
              defaultOpen={formValues.useBrushPose}
              onToggleEnabled={(v) => setFormValues('useBrushPose', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">Brush Pose settings coming soon</div>
            </CollapsibleSection>

            {/* Noise */}
            <CollapsibleSection
              id="noise"
              title="Noise"
              enabled={formValues.useNoise}
              defaultOpen={formValues.useNoise}
              onToggleEnabled={(v) => setFormValues('useNoise', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">Noise adds randomness to brush strokes</div>
            </CollapsibleSection>

            {/* Wet Edges */}
            <CollapsibleSection
              id="wet-edges"
              title="Wet Edges"
              enabled={formValues.useWetEdges}
              defaultOpen={formValues.useWetEdges}
              onToggleEnabled={(v) => setFormValues('useWetEdges', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">
                Wet Edges creates a watercolor-like effect
              </div>
            </CollapsibleSection>

            {/* Build-up */}
            <CollapsibleSection
              id="build-up"
              title="Build-up"
              enabled={formValues.useBuildUp}
              defaultOpen={formValues.useBuildUp}
              onToggleEnabled={(v) => setFormValues('useBuildUp', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">
                Build-up simulates traditional airbrush techniques
              </div>
            </CollapsibleSection>

            {/* Smoothing */}
            <CollapsibleSection
              id="smoothing"
              title="Smoothing"
              enabled={formValues.useSmoothing}
              defaultOpen={formValues.useSmoothing}
              onToggleEnabled={(v) => setFormValues('useSmoothing', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">
                Smoothing reduces jitter in brush strokes
              </div>
            </CollapsibleSection>

            {/* Protect Texture */}
            <CollapsibleSection
              id="protect-texture"
              title="Protect Texture"
              enabled={formValues.useProtectTexture}
              defaultOpen={formValues.useProtectTexture}
              onToggleEnabled={(v) => setFormValues('useProtectTexture', v)}
            >
              <div class="text-ps-text-muted py-4 text-center text-sm">
                Protect Texture preserves texture when using preset brushes
              </div>
            </CollapsibleSection>

            {/* Raw Settings */}
            <CollapsibleSection id="raw" title="Raw Settings" defaultOpen={false}>
              <RawSettingsPanel settings={props.brush.settings || {}} />
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </brush-detail-editable>
  );
}
