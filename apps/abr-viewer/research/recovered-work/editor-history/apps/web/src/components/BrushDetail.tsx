import { Show, For, createSignal, createMemo, Switch, Match } from 'solid-js';
import type { BrushWithPreview } from '~/lib/abr';
import { brushTipToPngBlob } from '~/lib/abr';

type BrushDetailProps = {
  brush: BrushWithPreview;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

// Control type mapping
const CONTROL_TYPES: Record<number, string> = {
  0: 'Off',
  1: 'Fade',
  2: 'Pen Pressure',
  3: 'Pen Tilt',
  4: 'Stylus Wheel',
  5: 'Rotation',
  6: 'Initial Direction',
  7: 'Direction',
};

// Blend mode mapping
const BLEND_MODES: Record<string, string> = {
  'Nrml': 'Normal',
  'Dslv': 'Dissolve',
  'Drkn': 'Darken',
  'Mltp': 'Multiply',
  'CBrn': 'Color Burn',
  'linearBurn': 'Linear Burn',
  'Lghn': 'Lighten',
  'Scrn': 'Screen',
  'CDdg': 'Color Dodge',
  'linearDodge': 'Linear Dodge',
  'Ovrl': 'Overlay',
  'SftL': 'Soft Light',
  'HrdL': 'Hard Light',
  'vividLight': 'Vivid Light',
  'linearLight': 'Linear Light',
  'pinLight': 'Pin Light',
  'hardMix': 'Hard Mix',
  'Dfrn': 'Difference',
  'Xclu': 'Exclusion',
  'Sbtr': 'Subtract',
  'divide': 'Divide',
  'H   ': 'Hue',
  'Strt': 'Saturation',
  'Clr ': 'Color',
  'Lmns': 'Luminosity',
};

export function BrushDetail(props: BrushDetailProps) {
  const [activePanel, setActivePanel] = createSignal<string>('brush-tip');
  const [downloading, setDownloading] = createSignal(false);

  const settings = () => props.brush.settings || {};
  const brushDef = () => (settings().Brsh as Record<string, unknown>) || {};

  // Extract all settings sections
  const hasTipDynamics = () => settings().useTipDynamics === true;
  const hasScatter = () => settings().useScatter === true;
  const hasTexture = () => settings().useTexture === true;
  const hasDualBrush = () => {
    const db = settings().dualBrush as Record<string, unknown>;
    return db?.useDualBrush === true;
  };
  const hasColorDynamics = () => settings().useColorDynamics === true;
  const hasTransfer = () => settings().usePaintDynamics === true;
  const hasBrushPose = () => settings().useBrushPose === true;

  const panels = createMemo(() => [
    { id: 'brush-tip', label: 'Brush Tip Shape', always: true },
    { id: 'shape-dynamics', label: 'Shape Dynamics', enabled: hasTipDynamics() },
    { id: 'scattering', label: 'Scattering', enabled: hasScatter() },
    { id: 'texture', label: 'Texture', enabled: hasTexture() },
    { id: 'dual-brush', label: 'Dual Brush', enabled: hasDualBrush() },
    { id: 'color-dynamics', label: 'Color Dynamics', enabled: hasColorDynamics() },
    { id: 'transfer', label: 'Transfer', enabled: hasTransfer() },
    { id: 'brush-pose', label: 'Brush Pose', enabled: hasBrushPose() },
    { id: 'toggles', label: 'Other Options', always: true },
    { id: 'raw', label: 'Raw Settings', always: true },
  ]);

  const handleDownloadImage = async () => {
    if (!props.brush.brushTip) return;
    setDownloading(true);
    try {
      const blob = await brushTipToPngBlob(props.brush.brushTip);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(props.brush.name)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={props.onClose}>
      <div
        class="bg-ps-bg rounded-lg shadow-ps-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-ps-border bg-ps-bg-dark">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded bg-ps-accent/20 flex items-center justify-center">
              <svg class="w-4 h-4 text-ps-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-medium text-ps-text-bright">{props.brush.name}</h2>
              <p class="text-xs text-ps-text-muted">
                {props.brush.type === 'computed' ? 'Computed Brush' : 'Sampled Brush'} • ID: {props.brush.id}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            {/* Action buttons */}
            <Show when={props.onEdit}>
              <button
                onClick={props.onEdit}
                class="px-3 py-1.5 text-sm bg-ps-accent hover:bg-ps-accent-hover text-white rounded flex items-center gap-2"
                title="Edit Brush"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </Show>
            <Show when={props.onDuplicate}>
              <button
                onClick={props.onDuplicate}
                class="px-3 py-1.5 text-sm bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded flex items-center gap-2"
                title="Duplicate Brush"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </Show>
            <Show when={props.onDelete}>
              <button
                onClick={props.onDelete}
                class="px-3 py-1.5 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded flex items-center gap-2"
                title="Delete Brush"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </Show>
            <button onClick={props.onClose} class="p-2 hover:bg-ps-bg-light rounded ml-2" aria-label="Close">
              <svg class="w-5 h-5 text-ps-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 flex overflow-hidden">
          {/* Left Panel - Settings Navigation */}
          <div class="w-48 bg-ps-bg-dark border-r border-ps-border overflow-y-auto flex-shrink-0">
            <For each={panels()}>
              {(panel) => (
                <button
                  onClick={() => setActivePanel(panel.id)}
                  class={`
                    w-full px-3 py-2 text-left text-sm flex items-center gap-2
                    ${activePanel() === panel.id ? 'bg-ps-bg-light text-ps-text-bright' : 'text-ps-text hover:bg-ps-bg-light/50'}
                    ${!panel.always && !panel.enabled ? 'opacity-50' : ''}
                  `}
                >
                  <Show when={!panel.always}>
                    <div class={`w-3 h-3 rounded-sm border ${panel.enabled ? 'bg-ps-accent border-ps-accent' : 'border-ps-border'}`}>
                      <Show when={panel.enabled}>
                        <svg class="w-3 h-3 text-white" viewBox="0 0 12 12">
                          <path d="M10 3L5 8L2 5" stroke="currentColor" stroke-width="2" fill="none" />
                        </svg>
                      </Show>
                    </div>
                  </Show>
                  {panel.label}
                </button>
              )}
            </For>
          </div>

          {/* Right Panel - Settings Content */}
          <div class="flex-1 overflow-y-auto p-4">
            <Switch>
              <Match when={activePanel() === 'brush-tip'}>
                <BrushTipPanel brush={props.brush} onDownload={handleDownloadImage} downloading={downloading()} />
              </Match>
              <Match when={activePanel() === 'shape-dynamics'}>
                <ShapeDynamicsPanel settings={settings()} enabled={hasTipDynamics()} />
              </Match>
              <Match when={activePanel() === 'scattering'}>
                <ScatteringPanel settings={settings()} enabled={hasScatter()} />
              </Match>
              <Match when={activePanel() === 'texture'}>
                <TexturePanel settings={settings()} enabled={hasTexture()} />
              </Match>
              <Match when={activePanel() === 'dual-brush'}>
                <DualBrushPanel 
                  settings={settings()} 
                  enabled={hasDualBrush()} 
                  dualBrushImageDataUrl={props.brush.dualBrushImageDataUrl}
                  dualBrushTip={props.brush.dualBrushTip}
                />
              </Match>
              <Match when={activePanel() === 'color-dynamics'}>
                <ColorDynamicsPanel settings={settings()} enabled={hasColorDynamics()} />
              </Match>
              <Match when={activePanel() === 'transfer'}>
                <TransferPanel settings={settings()} enabled={hasTransfer()} />
              </Match>
              <Match when={activePanel() === 'brush-pose'}>
                <BrushPosePanel settings={settings()} enabled={hasBrushPose()} />
              </Match>
              <Match when={activePanel() === 'toggles'}>
                <TogglesPanel settings={settings()} />
              </Match>
              <Match when={activePanel() === 'raw'}>
                <RawSettingsPanel settings={settings()} />
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function SettingRow(props: { label: string; value: string | number | undefined; unit?: string }) {
  return (
    <div class="flex justify-between items-center py-1.5 border-b border-ps-border/50 last:border-0">
      <span class="text-ps-text-muted text-sm">{props.label}</span>
      <span class="text-ps-text text-sm font-mono">
        {props.value !== undefined && props.value !== '—' ? `${props.value}${props.unit || ''}` : '—'}
      </span>
    </div>
  );
}

function DynamicsRow(props: { label: string; dynamics: Record<string, unknown> | undefined }) {
  if (!props.dynamics) return <SettingRow label={props.label} value="—" />;

  const jitter = extractValue(props.dynamics.jitter);
  const control = CONTROL_TYPES[(props.dynamics.bVTy as number) || 0] || 'Off';
  const minimum = extractValue(props.dynamics.Mnm || props.dynamics['Mnm ']);
  const fadeSteps = props.dynamics.fStp as number;

  return (
    <div class="py-2 border-b border-ps-border/50 last:border-0">
      <div class="flex justify-between items-center mb-1">
        <span class="text-ps-text-muted text-sm">{props.label}</span>
        <span class="text-ps-text text-sm font-mono">{formatPercent(jitter)}</span>
      </div>
      <div class="ml-4 space-y-1 text-xs">
        <div class="flex justify-between">
          <span class="text-ps-text-muted">Control</span>
          <span class="text-ps-text">{control}</span>
        </div>
        <Show when={control === 'Fade'}>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Fade Steps</span>
            <span class="text-ps-text">{fadeSteps}</span>
          </div>
        </Show>
        <Show when={minimum !== undefined}>
          <div class="flex justify-between">
            <span class="text-ps-text-muted">Minimum</span>
            <span class="text-ps-text">{formatPercent(minimum)}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}

function SectionHeader(props: { title: string; enabled?: boolean }) {
  return (
    <div class="flex items-center gap-2 mb-4 pb-2 border-b border-ps-border">
      <Show when={props.enabled !== undefined}>
        <div class={`w-4 h-4 rounded border ${props.enabled ? 'bg-ps-accent border-ps-accent' : 'border-ps-border'}`}>
          <Show when={props.enabled}>
            <svg class="w-4 h-4 text-white" viewBox="0 0 16 16">
              <path fill="none" stroke="currentColor" stroke-width="2" d="M3 8l4 4 6-6" />
            </svg>
          </Show>
        </div>
      </Show>
      <h3 class="text-ps-text-bright font-medium">{props.title}</h3>
    </div>
  );
}

function DisabledOverlay() {
  return (
    <div class="absolute inset-0 bg-ps-bg/80 flex items-center justify-center rounded-lg">
      <p class="text-ps-text-muted text-sm">This feature is disabled for this brush</p>
    </div>
  );
}

// Panel Components
function BrushTipPanel(props: { brush: BrushWithPreview; onDownload: () => void; downloading: boolean }) {
  const brushDef = () => (props.brush.settings?.Brsh as Record<string, unknown>) || {};
  const hasDualBrush = () => {
    const db = props.brush.settings?.dualBrush as Record<string, unknown>;
    return db?.useDualBrush === true;
  };

  return (
    <div>
      <SectionHeader title="Brush Tip Shape" />

      <div class="grid md:grid-cols-2 gap-6">
        {/* Preview(s) */}
        <div class="space-y-4">
          {/* Main Brush Tip */}
          <div>
            <Show when={hasDualBrush() && props.brush.dualBrushImageDataUrl}>
              <p class="text-xs text-ps-text-muted mb-2 uppercase tracking-wide text-center">Main Brush Tip</p>
            </Show>
            <div class="aspect-square checkered-bg rounded-lg overflow-hidden relative max-w-64 mx-auto">
              <Show
                when={props.brush.imageDataUrl}
                fallback={
                  <div class="absolute inset-0 flex items-center justify-center">
                    <p class="text-ps-text-muted text-sm">
                      {props.brush.type === 'computed' ? 'Computed brush' : 'No preview'}
                    </p>
                  </div>
                }
              >
                <img src={props.brush.imageDataUrl} alt={props.brush.name} class="absolute inset-0 w-full h-full object-contain p-2" />
              </Show>
            </div>
          </div>

          {/* Dual Brush Tip */}
          <Show when={hasDualBrush() && props.brush.dualBrushImageDataUrl}>
            <div class="pt-4 border-t border-ps-border">
              <p class="text-xs text-ps-text-muted mb-2 uppercase tracking-wide text-center">Dual Brush Tip</p>
              <div class="aspect-square checkered-bg rounded-lg overflow-hidden relative max-w-48 mx-auto">
                <img 
                  src={props.brush.dualBrushImageDataUrl} 
                  alt="Dual brush tip" 
                  class="absolute inset-0 w-full h-full object-contain p-2" 
                />
              </div>
              <Show when={props.brush.dualBrushTip}>
                <p class="text-center text-xs text-ps-text-muted mt-1">
                  {props.brush.dualBrushTip!.width} × {props.brush.dualBrushTip!.height} px
                </p>
              </Show>
            </div>
          </Show>

          <Show when={props.brush.brushTip}>
            <button
              onClick={props.onDownload}
              disabled={props.downloading}
              class="w-full py-2 px-4 bg-ps-accent hover:bg-ps-accent-hover disabled:opacity-50 text-white rounded flex items-center justify-center gap-2 text-sm"
            >
              <Show when={!props.downloading} fallback={<span>Downloading...</span>}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Main Tip PNG
              </Show>
            </button>
          </Show>
        </div>

        {/* Settings */}
        <div class="bg-ps-bg-dark rounded-lg p-4">
          <SettingRow label="Size" value={formatValue(extractValue(brushDef().Dmtr) || props.brush.diameter)} unit=" px" />
          <SettingRow label="Flip X" value={brushDef().flipX ? 'Yes' : 'No'} />
          <SettingRow label="Flip Y" value={brushDef().flipY ? 'Yes' : 'No'} />
          <SettingRow label="Angle" value={formatValue(extractValue(brushDef().Angl) || props.brush.angle)} unit="°" />
          <SettingRow label="Roundness" value={formatValue(extractValue(brushDef().Rndn) || props.brush.roundness)} unit="%" />
          <Show when={props.brush.type === 'computed'}>
            <SettingRow label="Hardness" value={formatValue(extractValue(brushDef().Hrdn) || props.brush.hardness)} unit="%" />
          </Show>
          <SettingRow label="Spacing" value={formatValue(extractValue(brushDef().Spcn) || props.brush.spacing)} unit="%" />

          <Show when={props.brush.brushTip}>
            <div class="mt-4 pt-4 border-t border-ps-border">
              <p class="text-xs text-ps-text-muted mb-2 uppercase tracking-wide">Brush Tip Image</p>
              <SettingRow label="Width" value={props.brush.brushTip!.width} unit=" px" />
              <SettingRow label="Height" value={props.brush.brushTip!.height} unit=" px" />
              <SettingRow label="Bit Depth" value={props.brush.brushTip!.depth} unit="-bit" />
            </div>
          </Show>

          <Show when={hasDualBrush()}>
            <div class="mt-4 pt-4 border-t border-ps-border">
              <p class="text-xs text-ps-accent mb-2 uppercase tracking-wide flex items-center gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
                Dual Brush Enabled
              </p>
              <p class="text-xs text-ps-text-muted">This brush uses a secondary texture. See the Dual Brush panel for details.</p>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

function ShapeDynamicsPanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  return (
    <div class="relative">
      <SectionHeader title="Shape Dynamics" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 space-y-1 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <DynamicsRow label="Size Jitter" dynamics={props.settings.szVr as Record<string, unknown>} />

        <div class="py-2 border-b border-ps-border/50">
          <div class="flex justify-between items-center">
            <span class="text-ps-text-muted text-sm">Minimum Diameter</span>
            <span class="text-ps-text text-sm font-mono">{formatPercent(extractValue(props.settings.minimumDiameter))}</span>
          </div>
        </div>

        <div class="py-2 border-b border-ps-border/50">
          <div class="flex justify-between items-center">
            <span class="text-ps-text-muted text-sm">Tilt Scale</span>
            <span class="text-ps-text text-sm font-mono">{formatPercent(extractValue(props.settings.tiltScale))}</span>
          </div>
        </div>

        <DynamicsRow label="Angle Jitter" dynamics={props.settings.angleDynamics as Record<string, unknown>} />
        <DynamicsRow label="Roundness Jitter" dynamics={props.settings.roundnessDynamics as Record<string, unknown>} />

        <div class="py-2 border-b border-ps-border/50">
          <div class="flex justify-between items-center">
            <span class="text-ps-text-muted text-sm">Minimum Roundness</span>
            <span class="text-ps-text text-sm font-mono">{formatPercent(extractValue(props.settings.minimumRoundness))}</span>
          </div>
        </div>

        <div class="pt-3 flex gap-4 text-sm">
          <label class="flex items-center gap-2">
            <Checkbox checked={props.settings.flipX === true} />
            <span class="text-ps-text">Flip X Jitter</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox checked={props.settings.flipY === true} />
            <span class="text-ps-text">Flip Y Jitter</span>
          </label>
        </div>

        <div class="pt-2">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={props.settings.brushProjection === true} />
            <span class="text-ps-text">Brush Projection</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function ScatteringPanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  return (
    <div class="relative">
      <SectionHeader title="Scattering" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <DynamicsRow label="Scatter" dynamics={props.settings.scatterDynamics as Record<string, unknown>} />

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={props.settings.bothAxes === true} />
            <span class="text-ps-text">Both Axes</span>
          </label>
        </div>

        <SettingRow label="Count" value={props.settings['Cnt '] as number} />

        <DynamicsRow label="Count Jitter" dynamics={props.settings.countDynamics as Record<string, unknown>} />
      </div>
    </div>
  );
}

function TexturePanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  const texture = () => (props.settings.Txtr as Record<string, unknown>) || {};

  return (
    <div class="relative">
      <SectionHeader title="Texture" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <SettingRow label="Pattern" value={(texture().Nm as string) || (texture()['Nm  '] as string)} />

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={texture().Invr === true} />
            <span class="text-ps-text">Invert</span>
          </label>
        </div>

        <SettingRow label="Scale" value={formatPercent(extractValue(texture().Scl))} />
        <SettingRow label="Brightness" value={texture().Brgh as number} />
        <SettingRow label="Contrast" value={texture().Cntr as number} />

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={texture().textureEachTip === true} />
            <span class="text-ps-text">Texture Each Tip</span>
          </label>
        </div>

        <SettingRow label="Mode" value={getBlendMode(texture().Md)} />
        <SettingRow label="Depth" value={formatPercent(extractValue(texture().textureDepth))} />
        <SettingRow label="Minimum Depth" value={formatPercent(extractValue(texture().minimumDepth))} />

        <DynamicsRow label="Depth Jitter" dynamics={texture().depthDynamics as Record<string, unknown>} />
      </div>
    </div>
  );
}

function DualBrushPanel(props: { 
  settings: Record<string, unknown>; 
  enabled: boolean;
  dualBrushImageDataUrl?: string;
  dualBrushTip?: { width: number; height: number; depth: number };
}) {
  const dual = () => (props.settings.dualBrush as Record<string, unknown>) || {};
  const dualBrushDef = () => (dual().Brsh as Record<string, unknown>) || {};

  return (
    <div class="relative">
      <SectionHeader title="Dual Brush" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        {/* Dual Brush Preview */}
        <Show when={props.dualBrushImageDataUrl}>
          <div class="mb-4 pb-4 border-b border-ps-border">
            <p class="text-xs text-ps-text-muted mb-2 uppercase tracking-wide">Dual Brush Tip Preview</p>
            <div class="aspect-square checkered-bg rounded-lg overflow-hidden relative max-w-32 mx-auto">
              <img 
                src={props.dualBrushImageDataUrl} 
                alt="Dual brush tip" 
                class="absolute inset-0 w-full h-full object-contain p-1" 
              />
            </div>
            <Show when={props.dualBrushTip}>
              <div class="mt-2 text-center text-xs text-ps-text-muted">
                {props.dualBrushTip!.width} × {props.dualBrushTip!.height} px
              </div>
            </Show>
          </div>
        </Show>

        <SettingRow label="Mode" value={getBlendMode(dual().BlnM)} />

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={dual().Flip === true} />
            <span class="text-ps-text">Flip</span>
          </label>
        </div>

        <div class="mt-4 mb-2 text-xs text-ps-text-muted uppercase tracking-wide">Dual Tip Settings</div>

        <SettingRow label="Brush Name" value={(dualBrushDef()['Nm  '] || dualBrushDef().Nm) as string} />
        <SettingRow label="Size" value={formatValue(extractValue(dualBrushDef().Dmtr))} unit=" px" />
        <SettingRow label="Spacing" value={formatPercent(extractValue(dual().Spcn))} />

        <Show when={dual().useScatter}>
          <DynamicsRow label="Scatter" dynamics={dual().scatterDynamics as Record<string, unknown>} />
        </Show>

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={dual().bothAxes === true} />
            <span class="text-ps-text">Both Axes</span>
          </label>
        </div>

        <SettingRow label="Count" value={dual()['Cnt '] as number} />

        <DynamicsRow label="Count Jitter" dynamics={dual().countDynamics as Record<string, unknown>} />
      </div>
    </div>
  );
}

function ColorDynamicsPanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  const colorDyn = () => (props.settings.clrDynamics as Record<string, unknown>) || props.settings;

  return (
    <div class="relative">
      <SectionHeader title="Color Dynamics" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <div class="py-2 border-b border-ps-border/50">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox checked={props.settings.colorDynamicsPerTip === true} />
            <span class="text-ps-text">Apply Per Tip</span>
          </label>
        </div>

        <DynamicsRow label="Foreground/Background Jitter" dynamics={colorDyn().fgBgJitter as Record<string, unknown>} />

        <SettingRow label="Hue Jitter" value={formatPercent(extractValue(colorDyn().hueJitter))} />
        <SettingRow label="Saturation Jitter" value={formatPercent(extractValue(colorDyn().satJitter))} />
        <SettingRow label="Brightness Jitter" value={formatPercent(extractValue(colorDyn().brtJitter))} />
        <SettingRow label="Purity" value={formatPercent(extractValue(colorDyn().purity))} />
      </div>
    </div>
  );
}

function TransferPanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  return (
    <div class="relative">
      <SectionHeader title="Transfer" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <DynamicsRow label="Opacity Jitter" dynamics={props.settings.opVr as Record<string, unknown>} />
        <DynamicsRow label="Flow Jitter" dynamics={props.settings.prVr as Record<string, unknown>} />
        <DynamicsRow label="Wetness Jitter" dynamics={props.settings.wtVr as Record<string, unknown>} />
        <DynamicsRow label="Mix Jitter" dynamics={props.settings.mxVr as Record<string, unknown>} />
      </div>
    </div>
  );
}

function BrushPosePanel(props: { settings: Record<string, unknown>; enabled: boolean }) {
  const pose = () => (props.settings.brushPose as Record<string, unknown>) || props.settings;

  return (
    <div class="relative">
      <SectionHeader title="Brush Pose" enabled={props.enabled} />

      <div class="bg-ps-bg-dark rounded-lg p-4 relative">
        <Show when={!props.enabled}>
          <DisabledOverlay />
        </Show>

        <div class="space-y-3">
          <div class="flex justify-between items-center py-1.5 border-b border-ps-border/50">
            <span class="text-ps-text-muted text-sm">Tilt X</span>
            <div class="flex items-center gap-3">
              <span class="text-ps-text text-sm font-mono">{formatValue(extractValue(pose().tiltX))}°</span>
              <label class="flex items-center gap-1 text-xs">
                <Checkbox checked={pose().overrideTiltX === true} />
                <span class="text-ps-text-muted">Override</span>
              </label>
            </div>
          </div>

          <div class="flex justify-between items-center py-1.5 border-b border-ps-border/50">
            <span class="text-ps-text-muted text-sm">Tilt Y</span>
            <div class="flex items-center gap-3">
              <span class="text-ps-text text-sm font-mono">{formatValue(extractValue(pose().tiltY))}°</span>
              <label class="flex items-center gap-1 text-xs">
                <Checkbox checked={pose().overrideTiltY === true} />
                <span class="text-ps-text-muted">Override</span>
              </label>
            </div>
          </div>

          <div class="flex justify-between items-center py-1.5 border-b border-ps-border/50">
            <span class="text-ps-text-muted text-sm">Rotation</span>
            <div class="flex items-center gap-3">
              <span class="text-ps-text text-sm font-mono">{formatValue(extractValue(pose().rotation))}°</span>
              <label class="flex items-center gap-1 text-xs">
                <Checkbox checked={pose().overrideRotation === true} />
                <span class="text-ps-text-muted">Override</span>
              </label>
            </div>
          </div>

          <div class="flex justify-between items-center py-1.5">
            <span class="text-ps-text-muted text-sm">Pressure</span>
            <div class="flex items-center gap-3">
              <span class="text-ps-text text-sm font-mono">{formatPercent(extractValue(pose().pressure))}</span>
              <label class="flex items-center gap-1 text-xs">
                <Checkbox checked={pose().overridePressure === true} />
                <span class="text-ps-text-muted">Override</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TogglesPanel(props: { settings: Record<string, unknown> }) {
  return (
    <div>
      <SectionHeader title="Other Options" />

      <div class="bg-ps-bg-dark rounded-lg p-4 space-y-4">
        <label class="flex items-center gap-3">
          <Checkbox checked={props.settings.Nose === true} />
          <div>
            <span class="text-ps-text">Noise</span>
            <p class="text-xs text-ps-text-muted">Adds randomness to individual brush tips</p>
          </div>
        </label>

        <label class="flex items-center gap-3">
          <Checkbox checked={props.settings.Wtdg === true} />
          <div>
            <span class="text-ps-text">Wet Edges</span>
            <p class="text-xs text-ps-text-muted">Creates a watercolor effect with darker edges</p>
          </div>
        </label>

        <label class="flex items-center gap-3">
          <Checkbox checked={props.settings.Rpt === true} />
          <div>
            <span class="text-ps-text">Build-up</span>
            <p class="text-xs text-ps-text-muted">Enables airbrush-style paint build-up</p>
          </div>
        </label>

        <label class="flex items-center gap-3">
          <Checkbox checked={props.settings.useSmoothing === true} />
          <div>
            <span class="text-ps-text">Smoothing</span>
            <p class="text-xs text-ps-text-muted">Produces smoother brush strokes</p>
          </div>
        </label>

        <label class="flex items-center gap-3">
          <Checkbox checked={props.settings.protectTexture === true} />
          <div>
            <span class="text-ps-text">Protect Texture</span>
            <p class="text-xs text-ps-text-muted">Uses same texture pattern for all brush presets</p>
          </div>
        </label>
      </div>
    </div>
  );
}

function RawSettingsPanel(props: { settings: Record<string, unknown> }) {
  return (
    <div>
      <SectionHeader title="Raw Settings Data" />

      <p class="text-xs text-ps-text-muted mb-3">
        Complete brush descriptor data as parsed from the ABR file. This includes all parameters stored in the brush preset.
      </p>

      <div class="bg-ps-bg-dark rounded-lg p-4 max-h-[60vh] overflow-y-auto">
        <pre class="text-xs font-mono whitespace-pre-wrap break-words">
          <JsonHighlight data={props.settings} />
        </pre>
      </div>
    </div>
  );
}

function Checkbox(props: { checked: boolean }) {
  return (
    <div class={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${props.checked ? 'bg-ps-accent border-ps-accent' : 'border-ps-border bg-ps-bg-dark'}`}>
      <Show when={props.checked}>
        <svg class="w-3 h-3 text-white" viewBox="0 0 12 12">
          <path fill="none" stroke="currentColor" stroke-width="2" d="M2 6l3 3 5-5" />
        </svg>
      </Show>
    </div>
  );
}

function JsonHighlight(props: { data: unknown; indent?: number }) {
  const indent = props.indent ?? 0;
  const padding = '  '.repeat(indent);

  if (props.data === null) return <span class="text-gray-500">null</span>;
  if (props.data === undefined) return <span class="text-gray-500">undefined</span>;
  if (typeof props.data === 'boolean') return <span class="text-blue-400">{String(props.data)}</span>;
  if (typeof props.data === 'number') return <span class="text-green-400">{props.data}</span>;
  if (typeof props.data === 'string') return <span class="text-orange-400">"{props.data}"</span>;

  if (Array.isArray(props.data)) {
    const arr = props.data;
    if (arr.length === 0) return <span>[]</span>;
    return (
      <>
        {'[\n'}
        <For each={arr}>
          {(item, i) => (
            <>
              {padding}{'  '}
              <JsonHighlight data={item} indent={indent + 1} />
              {i() < arr.length - 1 ? ',' : ''}
              {'\n'}
            </>
          )}
        </For>
        {padding}{']'}
      </>
    );
  }

  if (typeof props.data === 'object') {
    const entries = Object.entries(props.data as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <>
        {'{\n'}
        <For each={entries}>
          {([key, value], i) => (
            <>
              {padding}{'  '}<span class="text-cyan-400">"{key}"</span>: <JsonHighlight data={value} indent={indent + 1} />
              {i() < entries.length - 1 ? ',' : ''}
              {'\n'}
            </>
          )}
        </For>
        {padding}{'}'}
      </>
    );
  }

  return <span>{String(props.data)}</span>;
}

// Utility functions
function extractValue(obj: unknown): number | undefined {
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'object' && 'value' in (obj as object)) {
    return (obj as { value: number }).value;
  }
  return undefined;
}

function formatValue(val: number | undefined): string {
  if (val === undefined) return '—';
  return String(Math.round(val * 100) / 100);
}

function formatPercent(val: number | undefined): string {
  if (val === undefined) return '—';
  return `${Math.round(val * 100) / 100}%`;
}

function getBlendMode(obj: unknown): string {
  if (!obj) return '—';
  if (typeof obj === 'string') return BLEND_MODES[obj] || obj;
  if (typeof obj === 'object' && 'value' in (obj as object)) {
    const val = (obj as { value: string }).value;
    return BLEND_MODES[val] || val;
  }
  return '—';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}
