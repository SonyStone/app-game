import { Show, For, createSignal, createMemo, createEffect, Switch, Match } from 'solid-js';
import type { BrushWithPreview, BrushTipImage } from '~/lib/abr';
import { brushTipToPngBlob, createBrushTipFromCanvas } from '~/lib/abr';

type BrushDetailEditableProps {
  brush: BrushWithPreview;
  onClose: () => void;
  onSave?: (brush: BrushWithPreview) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

// Control type options
const CONTROL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 2, label: 'Pen Pressure' },
  { value: 3, label: 'Pen Tilt' },
  { value: 4, label: 'Stylus Wheel' },
  { value: 5, label: 'Rotation' },
  { value: 1, label: 'Fade' },
];

export function BrushDetailEditable(props: BrushDetailEditableProps) {
  const [activePanel, setActivePanel] = createSignal<string>('brush-tip');
  const [hasChanges, setHasChanges] = createSignal(false);
  const [downloading, setDownloading] = createSignal(false);

  // Editable state - core properties
  const [name, setName] = createSignal(props.brush.name);
  const [spacing, setSpacing] = createSignal(props.brush.spacing ?? 25);
  const [diameter, setDiameter] = createSignal(props.brush.diameter ?? 30);
  const [angle, setAngle] = createSignal(props.brush.angle ?? 0);
  const [roundness, setRoundness] = createSignal(props.brush.roundness ?? 100);
  const [hardness, setHardness] = createSignal(props.brush.hardness ?? 100);
  const [flipX, setFlipX] = createSignal(false);
  const [flipY, setFlipY] = createSignal(false);

  // Feature toggles
  const [useShapeDynamics, setUseShapeDynamics] = createSignal(props.brush.settings?.useTipDynamics === true);
  const [useScattering, setUseScattering] = createSignal(props.brush.settings?.useScatter === true);
  const [useTexture, setUseTexture] = createSignal(props.brush.settings?.useTexture === true);
  const [useDualBrush, setUseDualBrush] = createSignal(false);
  const [useColorDynamics, setUseColorDynamics] = createSignal(props.brush.settings?.useColorDynamics === true);
  const [useTransfer, setUseTransfer] = createSignal(props.brush.settings?.usePaintDynamics === true);
  const [useBrushPose, setUseBrushPose] = createSignal(props.brush.settings?.useBrushPose === true);
  const [useNoise, setUseNoise] = createSignal(props.brush.settings?.useNoise === true);
  const [useWetEdges, setUseWetEdges] = createSignal(props.brush.settings?.Wtdg === true);
  const [useBuildUp, setUseBuildUp] = createSignal(props.brush.settings?.useBuildUp === true);
  const [useSmoothing, setUseSmoothing] = createSignal(props.brush.settings?.useSmoothing === true);
  const [useProtectTexture, setUseProtectTexture] = createSignal(props.brush.settings?.useProtectTexture === true);

  // Shape dynamics state
  const [sizeJitter, setSizeJitter] = createSignal(0);
  const [sizeControl, setSizeControl] = createSignal(0);
  const [sizeMinimum, setSizeMinimum] = createSignal(0);
  const [minimumDiameter, setMinimumDiameter] = createSignal(0);
  const [tiltScale, setTiltScale] = createSignal(100);
  const [angleJitter, setAngleJitter] = createSignal(0);
  const [angleControl, setAngleControl] = createSignal(0);
  const [roundnessJitter, setRoundnessJitter] = createSignal(0);
  const [roundnessControl, setRoundnessControl] = createSignal(0);
  const [roundnessMinimum, setRoundnessMinimum] = createSignal(25);
  const [flipXJitter, setFlipXJitter] = createSignal(false);
  const [flipYJitter, setFlipYJitter] = createSignal(false);
  const [brushProjection, setBrushProjection] = createSignal(false);

  // Scattering state
  const [scatter, setScatter] = createSignal(0);
  const [scatterBothAxes, setScatterBothAxes] = createSignal(false);
  const [scatterControl, setScatterControl] = createSignal(0);
  const [scatterCount, setScatterCount] = createSignal(1);
  const [countJitter, setCountJitter] = createSignal(0);
  const [countControl, setCountControl] = createSignal(0);

  // Transfer state
  const [opacityJitter, setOpacityJitter] = createSignal(0);
  const [opacityControl, setOpacityControl] = createSignal(0);
  const [opacityMinimum, setOpacityMinimum] = createSignal(0);
  const [flowJitter, setFlowJitter] = createSignal(0);
  const [flowControl, setFlowControl] = createSignal(0);
  const [flowMinimum, setFlowMinimum] = createSignal(0);

  // Initialize from brush settings
  createEffect(() => {
    const settings = props.brush.settings || {};
    const brushDef = (settings.Brsh as Record<string, unknown>) || {};
    
    // Extract flip values
    setFlipX(brushDef.flipX === true);
    setFlipY(brushDef.flipY === true);

    // Extract shape dynamics
    const szVr = settings.szVr as Record<string, unknown>;
    if (szVr) {
      setSizeJitter(extractPercent(szVr.jitter));
      setSizeControl((szVr.bVTy as number) || 0);
      setSizeMinimum(extractPercent(szVr['Mnm '] || szVr.Mnm));
    }
    setMinimumDiameter(extractPercent(settings.minimalDiameter));
    setTiltScale(extractPercent(settings.tiltScale) || 100);

    const angleDynamics = settings.angleDynamics as Record<string, unknown>;
    if (angleDynamics) {
      setAngleJitter(extractPercent(angleDynamics.jitter));
      setAngleControl((angleDynamics.bVTy as number) || 0);
    }

    const roundnessDynamics = settings.roundnessDynamics as Record<string, unknown>;
    if (roundnessDynamics) {
      setRoundnessJitter(extractPercent(roundnessDynamics.jitter));
      setRoundnessControl((roundnessDynamics.bVTy as number) || 0);
      setRoundnessMinimum(extractPercent(roundnessDynamics['Mnm '] || roundnessDynamics.Mnm) || 25);
    }

    setFlipXJitter(settings.flipX === true);
    setFlipYJitter(settings.flipY === true);
    setBrushProjection(settings.brushProjection === true);

    // Extract scattering
    const scatterSettings = settings.scatter as Record<string, unknown>;
    if (scatterSettings) {
      setScatter(extractPercent(scatterSettings.Sctr));
      setScatterBothAxes(scatterSettings.bothAxes === true);
      setScatterControl((scatterSettings.bVTy as number) || 0);
      setScatterCount((scatterSettings['Cnt '] as number) || 1);
    }
    const countDynamics = settings.countDynamics as Record<string, unknown>;
    if (countDynamics) {
      setCountJitter(extractPercent(countDynamics.jitter));
      setCountControl((countDynamics.bVTy as number) || 0);
    }

    // Extract transfer
    const opacityDynamics = settings.opacityDynamics as Record<string, unknown>;
    if (opacityDynamics) {
      setOpacityJitter(extractPercent(opacityDynamics.jitter));
      setOpacityControl((opacityDynamics.bVTy as number) || 0);
      setOpacityMinimum(extractPercent(opacityDynamics['Mnm '] || opacityDynamics.Mnm));
    }
    const flowDynamics = settings.flowDynamics as Record<string, unknown>;
    if (flowDynamics) {
      setFlowJitter(extractPercent(flowDynamics.jitter));
      setFlowControl((flowDynamics.bVTy as number) || 0);
      setFlowMinimum(extractPercent(flowDynamics['Mnm '] || flowDynamics.Mnm));
    }
  });

  // Track changes
  const markChanged = () => setHasChanges(true);

  const panels = createMemo(() => [
    { id: 'brush-tip', label: 'Brush Tip Shape', always: true },
    { id: 'shape-dynamics', label: 'Shape Dynamics', enabled: useShapeDynamics, setEnabled: setUseShapeDynamics },
    { id: 'scattering', label: 'Scattering', enabled: useScattering, setEnabled: setUseScattering },
    { id: 'texture', label: 'Texture', enabled: useTexture, setEnabled: setUseTexture },
    { id: 'dual-brush', label: 'Dual Brush', enabled: useDualBrush, setEnabled: setUseDualBrush },
    { id: 'color-dynamics', label: 'Color Dynamics', enabled: useColorDynamics, setEnabled: setUseColorDynamics },
    { id: 'transfer', label: 'Transfer', enabled: useTransfer, setEnabled: setUseTransfer },
    { id: 'brush-pose', label: 'Brush Pose', enabled: useBrushPose, setEnabled: setUseBrushPose },
    { id: 'noise', label: 'Noise', enabled: useNoise, setEnabled: setUseNoise },
    { id: 'wet-edges', label: 'Wet Edges', enabled: useWetEdges, setEnabled: setUseWetEdges },
    { id: 'build-up', label: 'Build-up', enabled: useBuildUp, setEnabled: setUseBuildUp },
    { id: 'smoothing', label: 'Smoothing', enabled: useSmoothing, setEnabled: setUseSmoothing },
    { id: 'protect-texture', label: 'Protect Texture', enabled: useProtectTexture, setEnabled: setUseProtectTexture },
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
      a.download = `${sanitizeFilename(name())}.png`;
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

    // Start with original settings to preserve all fields
    const updatedSettings = { ...props.brush.settings };

    // Update only the settings that were explicitly changed
    updatedSettings.useTipDynamics = useShapeDynamics();
    updatedSettings.useScatter = useScattering();
    updatedSettings.useTexture = useTexture();
    updatedSettings.useColorDynamics = useColorDynamics();
    updatedSettings.usePaintDynamics = useTransfer();
    updatedSettings.useBrushPose = useBrushPose();
    updatedSettings.useNoise = useNoise();
    updatedSettings.Wtdg = useWetEdges();
    updatedSettings.useBuildUp = useBuildUp();
    updatedSettings.useSmoothing = useSmoothing();
    updatedSettings.useProtectTexture = useProtectTexture();
    updatedSettings.flipX = flipXJitter();
    updatedSettings.flipY = flipYJitter();
    updatedSettings.brushProjection = brushProjection();

    // Shape dynamics - merge with existing or create new
    if (useShapeDynamics()) {
      updatedSettings.szVr = {
        ...(updatedSettings.szVr as Record<string, unknown> || {}),
        jitter: { unit: '#Prc', value: sizeJitter() },
        bVTy: sizeControl(),
        'Mnm ': { unit: '#Prc', value: sizeMinimum() },
      };
      updatedSettings.angleDynamics = {
        ...(updatedSettings.angleDynamics as Record<string, unknown> || {}),
        jitter: { unit: '#Ang', value: angleJitter() },
        bVTy: angleControl(),
      };
      updatedSettings.roundnessDynamics = {
        ...(updatedSettings.roundnessDynamics as Record<string, unknown> || {}),
        jitter: { unit: '#Prc', value: roundnessJitter() },
        bVTy: roundnessControl(),
        'Mnm ': { unit: '#Prc', value: roundnessMinimum() },
      };
    }
    updatedSettings.minimumDiameter = { unit: '#Prc', value: minimumDiameter() };
    updatedSettings.tiltScale = { unit: '#Prc', value: tiltScale() };

    // Scattering - merge with existing or create new
    if (useScattering()) {
      updatedSettings.scatter = {
        ...(updatedSettings.scatter as Record<string, unknown> || {}),
        Sctr: { unit: '#Prc', value: scatter() },
        bothAxes: scatterBothAxes(),
        bVTy: scatterControl(),
        'Cnt ': scatterCount(),
      };
      updatedSettings.countDynamics = {
        ...(updatedSettings.countDynamics as Record<string, unknown> || {}),
        jitter: { unit: '#Prc', value: countJitter() },
        bVTy: countControl(),
      };
    }

    // Transfer - merge with existing or create new
    if (useTransfer()) {
      updatedSettings.opacityDynamics = {
        ...(updatedSettings.opacityDynamics as Record<string, unknown> || {}),
        jitter: { unit: '#Prc', value: opacityJitter() },
        bVTy: opacityControl(),
        'Mnm ': { unit: '#Prc', value: opacityMinimum() },
      };
      updatedSettings.flowDynamics = {
        ...(updatedSettings.flowDynamics as Record<string, unknown> || {}),
        jitter: { unit: '#Prc', value: flowJitter() },
        bVTy: flowControl(),
        'Mnm ': { unit: '#Prc', value: flowMinimum() },
      };
    }

    const updatedBrush: BrushWithPreview = {
      ...props.brush,
      name: name(),
      spacing: spacing(),
      diameter: diameter(),
      angle: angle(),
      roundness: roundness(),
      hardness: props.brush.type === 'computed' ? hardness() : props.brush.hardness,
      settings: updatedSettings,
    };

    props.onSave(updatedBrush);
    setHasChanges(false);
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
              <input
                type="text"
                value={name()}
                onInput={(e) => { setName(e.currentTarget.value); markChanged(); }}
                class="text-lg font-medium text-ps-text-bright bg-transparent border-b border-transparent hover:border-ps-border focus:border-ps-accent focus:outline-none px-1 -ml-1"
              />
              <p class="text-xs text-ps-text-muted">
                {props.brush.type === 'computed' ? 'Computed Brush' : 'Sampled Brush'} • ID: {props.brush.id}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={props.onSave}>
              <button
                onClick={handleSave}
                disabled={!hasChanges()}
                class={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${
                  hasChanges()
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-ps-bg-light text-ps-text-muted cursor-not-allowed'
                }`}
                title="Save Changes"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Save
              </button>
            </Show>
            <Show when={props.onDuplicate}>
              <button
                onClick={props.onDuplicate}
                class="p-2 text-sm bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded"
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
                class="p-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded"
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
          {/* Left Panel - Feature Toggles */}
          <div class="w-52 bg-ps-bg-dark border-r border-ps-border overflow-y-auto flex-shrink-0">
            <For each={panels()}>
              {(panel) => (
                <button
                  onClick={() => {
                    setActivePanel(panel.id);
                    // Toggle feature if clicking on checkbox area
                  }}
                  class={`
                    w-full px-3 py-2 text-left text-sm flex items-center gap-2
                    ${activePanel() === panel.id ? 'bg-ps-bg-light text-ps-text-bright' : 'text-ps-text hover:bg-ps-bg-light/50'}
                  `}
                >
                  <Show when={!panel.always && panel.setEnabled}>
                    <input
                      type="checkbox"
                      checked={panel.enabled?.()}
                      onChange={(e) => {
                        panel.setEnabled?.(e.currentTarget.checked);
                        markChanged();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      class="w-4 h-4 rounded border-ps-border bg-ps-bg-dark checked:bg-ps-accent checked:border-ps-accent"
                    />
                  </Show>
                  <Show when={panel.always}>
                    <div class="w-4" />
                  </Show>
                  <span class={!panel.always && !panel.enabled?.() ? 'opacity-50' : ''}>{panel.label}</span>
                </button>
              )}
            </For>
          </div>

          {/* Right Panel - Settings Content */}
          <div class="flex-1 overflow-y-auto p-4">
            <Switch>
              <Match when={activePanel() === 'brush-tip'}>
                <BrushTipPanel
                  brush={props.brush}
                  diameter={diameter}
                  setDiameter={(v) => { setDiameter(v); markChanged(); }}
                  angle={angle}
                  setAngle={(v) => { setAngle(v); markChanged(); }}
                  roundness={roundness}
                  setRoundness={(v) => { setRoundness(v); markChanged(); }}
                  hardness={hardness}
                  setHardness={(v) => { setHardness(v); markChanged(); }}
                  spacing={spacing}
                  setSpacing={(v) => { setSpacing(v); markChanged(); }}
                  flipX={flipX}
                  setFlipX={(v) => { setFlipX(v); markChanged(); }}
                  flipY={flipY}
                  setFlipY={(v) => { setFlipY(v); markChanged(); }}
                  onDownload={handleDownloadImage}
                  downloading={downloading()}
                />
              </Match>
              <Match when={activePanel() === 'shape-dynamics'}>
                <ShapeDynamicsPanel
                  enabled={useShapeDynamics()}
                  sizeJitter={sizeJitter} setSizeJitter={(v) => { setSizeJitter(v); markChanged(); }}
                  sizeControl={sizeControl} setSizeControl={(v) => { setSizeControl(v); markChanged(); }}
                  sizeMinimum={sizeMinimum} setSizeMinimum={(v) => { setSizeMinimum(v); markChanged(); }}
                  minimumDiameter={minimumDiameter} setMinimumDiameter={(v) => { setMinimumDiameter(v); markChanged(); }}
                  tiltScale={tiltScale} setTiltScale={(v) => { setTiltScale(v); markChanged(); }}
                  angleJitter={angleJitter} setAngleJitter={(v) => { setAngleJitter(v); markChanged(); }}
                  angleControl={angleControl} setAngleControl={(v) => { setAngleControl(v); markChanged(); }}
                  roundnessJitter={roundnessJitter} setRoundnessJitter={(v) => { setRoundnessJitter(v); markChanged(); }}
                  roundnessControl={roundnessControl} setRoundnessControl={(v) => { setRoundnessControl(v); markChanged(); }}
                  roundnessMinimum={roundnessMinimum} setRoundnessMinimum={(v) => { setRoundnessMinimum(v); markChanged(); }}
                  flipXJitter={flipXJitter} setFlipXJitter={(v) => { setFlipXJitter(v); markChanged(); }}
                  flipYJitter={flipYJitter} setFlipYJitter={(v) => { setFlipYJitter(v); markChanged(); }}
                  brushProjection={brushProjection} setBrushProjection={(v) => { setBrushProjection(v); markChanged(); }}
                />
              </Match>
              <Match when={activePanel() === 'scattering'}>
                <ScatteringPanel
                  enabled={useScattering()}
                  scatter={scatter} setScatter={(v) => { setScatter(v); markChanged(); }}
                  bothAxes={scatterBothAxes} setBothAxes={(v) => { setScatterBothAxes(v); markChanged(); }}
                  scatterControl={scatterControl} setScatterControl={(v) => { setScatterControl(v); markChanged(); }}
                  count={scatterCount} setCount={(v) => { setScatterCount(v); markChanged(); }}
                  countJitter={countJitter} setCountJitter={(v) => { setCountJitter(v); markChanged(); }}
                  countControl={countControl} setCountControl={(v) => { setCountControl(v); markChanged(); }}
                />
              </Match>
              <Match when={activePanel() === 'transfer'}>
                <TransferPanel
                  enabled={useTransfer()}
                  opacityJitter={opacityJitter} setOpacityJitter={(v) => { setOpacityJitter(v); markChanged(); }}
                  opacityControl={opacityControl} setOpacityControl={(v) => { setOpacityControl(v); markChanged(); }}
                  opacityMinimum={opacityMinimum} setOpacityMinimum={(v) => { setOpacityMinimum(v); markChanged(); }}
                  flowJitter={flowJitter} setFlowJitter={(v) => { setFlowJitter(v); markChanged(); }}
                  flowControl={flowControl} setFlowControl={(v) => { setFlowControl(v); markChanged(); }}
                  flowMinimum={flowMinimum} setFlowMinimum={(v) => { setFlowMinimum(v); markChanged(); }}
                />
              </Match>
              <Match when={activePanel() === 'raw'}>
                <RawSettingsPanel settings={props.brush.settings || {}} />
              </Match>
              <Match when={true}>
                <div class="text-center text-ps-text-muted py-8">
                  <p>Panel content for "{activePanel()}" coming soon</p>
                </div>
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function extractPercent(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: number }).value;
  }
  return 0;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

// Editable input components
function SliderInput(props: {
  label: string;
  value: () => number;
  setValue: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div class="flex items-center gap-3 py-2">
      <span class="text-ps-text-muted text-sm w-32 flex-shrink-0">{props.label}</span>
      <input
        type="range"
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        value={props.value()}
        onInput={(e) => props.setValue(parseFloat(e.currentTarget.value))}
        class="flex-1 h-1 bg-ps-bg-lighter rounded appearance-none cursor-pointer"
      />
      <div class="w-20 flex items-center">
        <input
          type="number"
          min={props.min ?? 0}
          max={props.max ?? 100}
          step={props.step ?? 1}
          value={props.value()}
          onInput={(e) => props.setValue(parseFloat(e.currentTarget.value) || 0)}
          class="w-16 bg-ps-bg-dark border border-ps-border rounded px-2 py-1 text-sm text-right text-ps-text"
        />
        <span class="text-ps-text-muted text-sm ml-1">{props.unit ?? '%'}</span>
      </div>
    </div>
  );
}

function ControlSelect(props: {
  label: string;
  value: () => number;
  setValue: (v: number) => void;
}) {
  return (
    <div class="flex items-center gap-3 py-1 ml-8">
      <span class="text-ps-text-muted text-sm w-24">{props.label}</span>
      <select
        value={props.value()}
        onChange={(e) => props.setValue(parseInt(e.currentTarget.value))}
        class="flex-1 bg-ps-bg-dark border border-ps-border rounded px-2 py-1 text-sm text-ps-text"
      >
        <For each={CONTROL_OPTIONS}>
          {(opt) => <option value={opt.value}>{opt.label}</option>}
        </For>
      </select>
    </div>
  );
}

function CheckboxInput(props: {
  label: string;
  checked: () => boolean;
  setChecked: (v: boolean) => void;
}) {
  return (
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={props.checked()}
        onChange={(e) => props.setChecked(e.currentTarget.checked)}
        class="w-4 h-4 rounded border-ps-border bg-ps-bg-dark checked:bg-ps-accent"
      />
      <span class="text-ps-text text-sm">{props.label}</span>
    </label>
  );
}

// Panel Components
function BrushTipPanel(props: {
  brush: BrushWithPreview;
  diameter: () => number;
  setDiameter: (v: number) => void;
  angle: () => number;
  setAngle: (v: number) => void;
  roundness: () => number;
  setRoundness: (v: number) => void;
  hardness: () => number;
  setHardness: (v: number) => void;
  spacing: () => number;
  setSpacing: (v: number) => void;
  flipX: () => boolean;
  setFlipX: (v: boolean) => void;
  flipY: () => boolean;
  setFlipY: (v: boolean) => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div>
      <h3 class="text-ps-text-bright font-medium mb-4 pb-2 border-b border-ps-border">Brush Tip Shape</h3>

      <div class="grid md:grid-cols-2 gap-6">
        {/* Preview */}
        <div class="space-y-4">
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
              <img
                src={props.brush.imageDataUrl}
                alt={props.brush.name}
                class="absolute inset-0 w-full h-full object-contain p-2"
                style={{
                  transform: `rotate(${props.angle()}deg) scaleX(${props.flipX() ? -1 : 1}) scaleY(${props.flipY() ? -1 : 1})`,
                }}
              />
            </Show>
          </div>

          <Show when={props.brush.brushTip}>
            <button
              onClick={props.onDownload}
              disabled={props.downloading}
              class="w-full py-2 px-4 bg-ps-accent hover:bg-ps-accent-hover disabled:opacity-50 text-white rounded text-sm"
            >
              {props.downloading ? 'Downloading...' : 'Download PNG'}
            </button>
          </Show>
        </div>

        {/* Settings */}
        <div class="space-y-1">
          <SliderInput
            label="Size"
            value={props.diameter}
            setValue={props.setDiameter}
            min={1}
            max={2500}
            unit=" px"
          />
          
          <div class="flex items-center gap-4 py-2 ml-8">
            <CheckboxInput label="Flip X" checked={props.flipX} setChecked={props.setFlipX} />
            <CheckboxInput label="Flip Y" checked={props.flipY} setChecked={props.setFlipY} />
          </div>

          <SliderInput
            label="Angle"
            value={props.angle}
            setValue={props.setAngle}
            min={-180}
            max={180}
            unit="°"
          />

          <SliderInput
            label="Roundness"
            value={props.roundness}
            setValue={props.setRoundness}
            min={0}
            max={100}
            unit="%"
          />

          <Show when={props.brush.type === 'computed'}>
            <SliderInput
              label="Hardness"
              value={props.hardness}
              setValue={props.setHardness}
              min={0}
              max={100}
              unit="%"
            />
          </Show>

          <div class="pt-4 border-t border-ps-border mt-4">
            <SliderInput
              label="Spacing"
              value={props.spacing}
              setValue={props.setSpacing}
              min={1}
              max={1000}
              unit="%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ShapeDynamicsPanel(props: {
  enabled: boolean;
  sizeJitter: () => number; setSizeJitter: (v: number) => void;
  sizeControl: () => number; setSizeControl: (v: number) => void;
  sizeMinimum: () => number; setSizeMinimum: (v: number) => void;
  minimumDiameter: () => number; setMinimumDiameter: (v: number) => void;
  tiltScale: () => number; setTiltScale: (v: number) => void;
  angleJitter: () => number; setAngleJitter: (v: number) => void;
  angleControl: () => number; setAngleControl: (v: number) => void;
  roundnessJitter: () => number; setRoundnessJitter: (v: number) => void;
  roundnessControl: () => number; setRoundnessControl: (v: number) => void;
  roundnessMinimum: () => number; setRoundnessMinimum: (v: number) => void;
  flipXJitter: () => boolean; setFlipXJitter: (v: boolean) => void;
  flipYJitter: () => boolean; setFlipYJitter: (v: boolean) => void;
  brushProjection: () => boolean; setBrushProjection: (v: boolean) => void;
}) {
  return (
    <div class={props.enabled ? '' : 'opacity-50 pointer-events-none'}>
      <h3 class="text-ps-text-bright font-medium mb-4 pb-2 border-b border-ps-border flex items-center gap-2">
        <div class={`w-4 h-4 rounded ${props.enabled ? 'bg-ps-accent' : 'bg-ps-bg-lighter'}`} />
        Shape Dynamics
      </h3>

      <div class="space-y-4">
        <div>
          <SliderInput label="Size Jitter" value={props.sizeJitter} setValue={props.setSizeJitter} />
          <ControlSelect label="Control" value={props.sizeControl} setValue={props.setSizeControl} />
          <SliderInput label="Minimum" value={props.sizeMinimum} setValue={props.setSizeMinimum} />
        </div>

        <SliderInput label="Minimum Diameter" value={props.minimumDiameter} setValue={props.setMinimumDiameter} />
        <SliderInput label="Tilt Scale" value={props.tiltScale} setValue={props.setTiltScale} max={200} />

        <div class="pt-4 border-t border-ps-border">
          <SliderInput label="Angle Jitter" value={props.angleJitter} setValue={props.setAngleJitter} unit="°" max={360} />
          <ControlSelect label="Control" value={props.angleControl} setValue={props.setAngleControl} />
        </div>

        <div class="pt-4 border-t border-ps-border">
          <SliderInput label="Roundness Jitter" value={props.roundnessJitter} setValue={props.setRoundnessJitter} />
          <ControlSelect label="Control" value={props.roundnessControl} setValue={props.setRoundnessControl} />
          <SliderInput label="Minimum" value={props.roundnessMinimum} setValue={props.setRoundnessMinimum} />
        </div>

        <div class="pt-4 border-t border-ps-border flex items-center gap-6">
          <CheckboxInput label="Flip X Jitter" checked={props.flipXJitter} setChecked={props.setFlipXJitter} />
          <CheckboxInput label="Flip Y Jitter" checked={props.flipYJitter} setChecked={props.setFlipYJitter} />
        </div>

        <CheckboxInput label="Brush Projection" checked={props.brushProjection} setChecked={props.setBrushProjection} />
      </div>
    </div>
  );
}

function ScatteringPanel(props: {
  enabled: boolean;
  scatter: () => number; setScatter: (v: number) => void;
  bothAxes: () => boolean; setBothAxes: (v: boolean) => void;
  scatterControl: () => number; setScatterControl: (v: number) => void;
  count: () => number; setCount: (v: number) => void;
  countJitter: () => number; setCountJitter: (v: number) => void;
  countControl: () => number; setCountControl: (v: number) => void;
}) {
  return (
    <div class={props.enabled ? '' : 'opacity-50 pointer-events-none'}>
      <h3 class="text-ps-text-bright font-medium mb-4 pb-2 border-b border-ps-border flex items-center gap-2">
        <div class={`w-4 h-4 rounded ${props.enabled ? 'bg-ps-accent' : 'bg-ps-bg-lighter'}`} />
        Scattering
      </h3>

      <div class="space-y-4">
        <div>
          <SliderInput label="Scatter" value={props.scatter} setValue={props.setScatter} max={1000} />
          <CheckboxInput label="Both Axes" checked={props.bothAxes} setChecked={props.setBothAxes} />
          <ControlSelect label="Control" value={props.scatterControl} setValue={props.setScatterControl} />
        </div>

        <div class="pt-4 border-t border-ps-border">
          <SliderInput label="Count" value={props.count} setValue={props.setCount} min={1} max={16} unit="" />
          <SliderInput label="Count Jitter" value={props.countJitter} setValue={props.setCountJitter} />
          <ControlSelect label="Control" value={props.countControl} setValue={props.setCountControl} />
        </div>
      </div>
    </div>
  );
}

function TransferPanel(props: {
  enabled: boolean;
  opacityJitter: () => number; setOpacityJitter: (v: number) => void;
  opacityControl: () => number; setOpacityControl: (v: number) => void;
  opacityMinimum: () => number; setOpacityMinimum: (v: number) => void;
  flowJitter: () => number; setFlowJitter: (v: number) => void;
  flowControl: () => number; setFlowControl: (v: number) => void;
  flowMinimum: () => number; setFlowMinimum: (v: number) => void;
}) {
  return (
    <div class={props.enabled ? '' : 'opacity-50 pointer-events-none'}>
      <h3 class="text-ps-text-bright font-medium mb-4 pb-2 border-b border-ps-border flex items-center gap-2">
        <div class={`w-4 h-4 rounded ${props.enabled ? 'bg-ps-accent' : 'bg-ps-bg-lighter'}`} />
        Transfer
      </h3>

      <div class="space-y-4">
        <div>
          <SliderInput label="Opacity Jitter" value={props.opacityJitter} setValue={props.setOpacityJitter} />
          <ControlSelect label="Control" value={props.opacityControl} setValue={props.setOpacityControl} />
          <SliderInput label="Minimum" value={props.opacityMinimum} setValue={props.setOpacityMinimum} />
        </div>

        <div class="pt-4 border-t border-ps-border">
          <SliderInput label="Flow Jitter" value={props.flowJitter} setValue={props.setFlowJitter} />
          <ControlSelect label="Control" value={props.flowControl} setValue={props.setFlowControl} />
          <SliderInput label="Minimum" value={props.flowMinimum} setValue={props.setFlowMinimum} />
        </div>
      </div>
    </div>
  );
}

function RawSettingsPanel(props: { settings: Record<string, unknown> }) {
  return (
    <div>
      <h3 class="text-ps-text-bright font-medium mb-4 pb-2 border-b border-ps-border">Raw Settings</h3>
      <pre class="bg-ps-bg-dark rounded p-4 text-xs text-ps-text-muted overflow-auto max-h-96 font-mono">
        {JSON.stringify(props.settings, null, 2)}
      </pre>
    </div>
  );
}
