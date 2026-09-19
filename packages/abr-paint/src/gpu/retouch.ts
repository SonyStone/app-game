import type { TgpuRoot } from 'typegpu';
import { TILE_SIZE, type Dab } from '../input';
import type { AbrStrokeRenderer, AbrBrushInput } from '../contracts';
import type { AbrRasterSettings, createAbrStamps } from './abrStamps';
import type { createCanvasPickup, PickupLayer, PickupRegion } from './canvasPickup';
import { createCanvasFilter } from './canvasFilter';
import { commandBatch } from './commandBatch';
import { filterTiles } from './filterTiles';
import { createMixerWells } from './mixerWells';
import { createSmudgePickup } from './smudgePickup';
import { rendererToolState, type RendererToolState } from './toolState';

/** Canvas access borrowed by ABR retouch tools. Calls are serialized with the host's stroke lifetime.
 * capture returns GPU-owned pixels. Submit their consumers before the next capture, or use the borrowed batch.
 * deposit must flush a supplied batch before recycling any referenced tile. It must not finish/cancel the stroke.
 * tileKeys returns only writable tiles, already clipped to the host document extent.
 */
export type AbrRetouchHost<Layer extends PickupLayer> = {
  capture: (
    region: PickupRegion,
    layers: readonly Layer[],
    allLayers?: boolean,
    exact?: boolean,
    linear?: boolean,
    commands?: ReturnType<typeof commandBatch>,
    maxDimension?: number
  ) => ReturnType<ReturnType<typeof createCanvasPickup<Layer>>['capture']>;
  deposit: (
    dabs: readonly Dab[],
    sampled: NonNullable<Parameters<ReturnType<typeof createAbrStamps>['composite']>[2]>,
    onlyTile?: string,
    commands?: ReturnType<typeof commandBatch>
  ) => Promise<void>;
  tileKeys: (dab: Dab) => Iterable<string>;
};

/** Retouch consumes tool behavior only; tip resources and mask settings belong to the rasterizer. */
export type AbrRetouchSettings<Layer> = Pick<AbrRasterSettings<Layer>, 'smudge' | 'filter' | 'mixer' | 'mixing'>;

/** Device-scoped Smudge, Blur/Sharpen and Mixer orchestration. Owns carried paint and reservoirs,
 * but no document tiles, history, input scheduling or presentation targets. GPU allocations stay lazy.
 * begin/paint/finish/cancel and idle tool commands must be serialized by the caller.
 */
export function createAbrRetouch<Layer extends PickupLayer>(
  root: TgpuRoot,
  host: AbrRetouchHost<Layer>,
  options: {
    /** False keeps individual pickup/carry/deposit submissions for comparisons. Defaults to true. */
    batchSmudgePasses?: boolean;
    /** False submits every dab instead of sharing small-footprint batches. Defaults to true. */
    batchSmudgeDabs?: boolean;
    /** Called only after the current GPU batch is submitted. May present, but must not reenter painting. */
    onPaintProgress?: () => Promise<void>;
  } = {}
) {
  const device = root.device;
  let smudge: AbrRasterSettings<Layer>['smudge'];
  let filter: AbrRasterSettings<Layer>['filter'];
  let mixer: AbrRasterSettings<Layer>['mixer'];
  let retouchLinear = false;
  let sharedScratch = false;
  let color = '#000000';
  let previousSmudge: { x: number; y: number } | undefined;
  let smudgeSecondary: Dab[] = [];
  let canvasFilter: ReturnType<typeof createCanvasFilter> | undefined;
  let mixerWells: ReturnType<typeof createMixerWells> | undefined;
  let smudgePickup: ReturnType<typeof createSmudgePickup> | undefined;

  return {
    /** Whether the current preset needs ordered canvas pickup rather than ordinary mask accumulation. */
    get active() { return !!(smudge || filter || mixer); },
    /** Captures one gesture's settings. Reservoirs persist; carried Smudge pixels and secondary dabs do not. */
    begin(settings: AbrRetouchSettings<Layer> | undefined, foreground: string, shared: boolean) {
      smudge = settings?.smudge;
      filter = settings?.filter;
      mixer = settings?.mixer;
      retouchLinear = settings?.mixing === 'linear';
      sharedScratch = shared;
      color = foreground;
      previousSmudge = undefined;
      smudgeSecondary = [];
      smudgePickup?.reset();
      if (mixer) (mixerWells ??= createMixerWells(root)).begin(mixer.key, color, mixer);
    },
    /** Preserves dependent dab order, including pickup-only initialization and pending dual-brush dabs. */
    async paint(dabs: readonly Dab[]) {
      if (!smudge && !mixer && !filter) return;
      if (smudge?.strength === 0 || filter?.strength === 0) return;
      smudgeSecondary.push(...dabs.filter((dab) => dab.abr?.secondary));
      const batchDabs =
        !!smudge && sharedScratch && options.batchSmudgePasses !== false && options.batchSmudgeDabs !== false;
      const shared = batchDabs ? commandBatch(device) : undefined;
      let pendingDabs = 0;
      let presentedAt = performance.now();
      try {
        for (const dab of dabs) {
          if (dab.abr?.secondary) continue;
          if (filter) {
            await paintFiltered(dab, smudgeSecondary);
            smudgeSecondary = [];
            if (options.onPaintProgress) await options.onPaintProgress();
            continue;
          }
          const first = !previousSmudge;
          const previous = previousSmudge ?? dab;
          previousSmudge = { x: dab.x, y: dab.y };
          const radius = Math.max(1, dab.radius);
          const center = dab;
          const region = { x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2 };
          const tool = mixer ?? smudge!;
          const pickupScale = tool.pickupScale;
          const commands = shared ?? (smudge && options.batchSmudgePasses !== false ? commandBatch(device) : undefined);
          // Cross-dab batching helps submission-bound small footprints. Large dabs
          // already batch many tile passes and gain little from retaining extra scratch.
          const largeFootprint = radius > TILE_SIZE / 4;
          if (largeFootprint) shared?.flush();
          try {
            const canvas = await host.capture(
              region,
              tool.layers,
              tool.allLayers,
              false,
              !!smudge && retouchLinear,
              commands,
              // Quantize the pressure-dependent budget to avoid reallocating at every pixel of diameter.
              pickupScale !== undefined
                ? Math.min(1024, Math.max(64, Math.ceil(Math.max(region.width, region.height) * pickupScale / 64) * 64))
                : undefined
            );
            const carried = smudge
              ? (smudgePickup ??= createSmudgePickup(root)).step(
                  canvas,
                  smudge.strength,
                  retouchLinear,
                  first && smudge.fingerPainting
                    ? dab.abr
                      ? [dab.abr.data[12]!, dab.abr.data[13]!, dab.abr.data[14]!]
                      : hexColor(color)
                    : undefined,
                  commands
                )
              : undefined;
            if (first && smudge && !smudge.fingerPainting) {
              smudgeSecondary = [];
              continue;
            }
            const patch = mixer
              ? mixerWells!.step(
                  canvas,
                  dab.abr?.mixing?.wet ?? mixer.wet,
                  dab.abr?.mixing?.mix ?? mixer.mix,
                  dab.flow,
                  first ? 0 : Math.hypot(dab.x - previous.x, dab.y - previous.y) / (radius * 2)
                )
              : carried!;
            await host.deposit(
              [...smudgeSecondary, dab],
              {
                patch,
                x: dab.x - radius,
                y: dab.y - radius,
                width: radius * 2,
                height: radius * 2,
                strength: first && smudge?.fingerPainting ? smudge.strength : 1,
                clip: carried?.clip,
                fingerPainting: first && (smudge?.fingerPainting ?? false),
                mixer: !!mixer
              },
              undefined,
              commands
            );
          } finally {
            // A single-dab owner submits here, including pickup-only initialization.
            if (!shared) commands?.flush();
          }
          smudgeSecondary = [];
          if (!shared || largeFootprint || ++pendingDabs >= 8 || performance.now() - presentedAt >= 8) {
            shared?.flush();
            pendingDabs = 0;
            if (options.onPaintProgress) await options.onPaintProgress();
            presentedAt = performance.now();
          }
        }
      } finally {
        shared?.flush();
      }
      if (shared && options.onPaintProgress) await options.onPaintProgress();
    },
    /** Commits reservoir consumption only after the host successfully commits its stroke. */
    finish() {
      if (mixer) mixerWells!.finish();
      clearGesture();
    },
    /** Rolls back reservoir changes and releases carried paint; document rollback belongs to the host. */
    cancel() {
      mixerWells?.cancel();
      clearGesture();
    },
    /** Captures device-independent tool paint between gestures, never during document autosave. */
    async snapshot(): Promise<RendererToolState> {
      return { version: 1, mixer: await mixerWells?.snapshot() };
    },
    /** Validates before changing reservoirs; an empty payload clears existing tool paint. Call only while idle. */
    restore(input: unknown) {
      const state = rendererToolState.parse(input);
      if (state.mixer) (mixerWells ??= createMixerWells(root)).restore(state.mixer);
      else {
        mixerWells?.destroy();
        mixerWells = undefined;
      }
    },
    /** Changes the selected Mixer reservoir without editing document pixels. Call only while idle. */
    mixerCommand(...args: Parameters<ReturnType<typeof createMixerWells>['command']>) {
      (mixerWells ??= createMixerWells(root)).command(...args);
    },
    /** Loads document paint through the host's capture path, excluding the presentation background. */
    async loadMixerFromCanvas(options: Parameters<AbrStrokeRenderer<Layer, unknown, AbrBrushInput>['loadMixerFromCanvas']>[0]) {
      if (!Number.isFinite(options.size) || options.size <= 0 || options.size > 5000)
        throw new Error('Mixer Brush size must be between 0 and 5000 pixels.');
      const { point, size, solid } = options;
      const region = solid
        ? { x: Math.floor(point.x), y: Math.floor(point.y), width: 1, height: 1 }
        : { x: point.x - size / 2, y: point.y - size / 2, width: size, height: size };
      const patch = await host.capture(region, options.layers, options.allLayers);
      (mixerWells ??= createMixerWells(root)).loadCanvas(patch, options.key, options.color, options);
    },
    /** Owned GPU scratch/reservoir bytes; host pickup textures and destination tiles are excluded. */
    bytes() {
      return (canvasFilter?.bytes() ?? 0) + (mixerWells?.bytes ?? 0) + (smudgePickup?.bytes() ?? 0);
    },
    /** Releases device resources after pending paint operations finish. */
    destroy() {
      mixerWells?.destroy();
      mixerWells = undefined;
      smudgePickup?.destroy();
      smudgePickup = undefined;
      canvasFilter?.destroy();
      canvasFilter = undefined;
      clearGesture();
    }
  };

  function clearGesture() {
    smudgePickup?.reset();
    previousSmudge = undefined;
    smudgeSecondary = [];
    smudge = undefined;
    filter = undefined;
    mixer = undefined;
  }

  /** Keep each source halo unchanged until every dependent tile has read it. Outputs stay GPU-owned. */
  async function paintFiltered(dab: Dab, secondary: readonly Dab[]) {
    canvasFilter ??= createCanvasFilter(root);
    const pending = new Map<string, ReturnType<typeof canvasFilter.render>>();
    try {
      for (const { key, release } of filterTiles(host.tileKeys(dab))) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        const patch = await host.capture(
          { x: x * 256 - 1, y: y * 256 - 1, width: 258, height: 258 },
          filter!.layers,
          filter!.allLayers,
          true,
          retouchLinear
        );
        pending.set(key, canvasFilter.render(patch, filter!.sharpen, filter!.protectDetail, retouchLinear));
        for (const finished of release) {
          const output = pending.get(finished)!;
          await host.deposit(
            [...secondary, dab],
            {
              patch: output,
              ...output.region,
              strength: 1 - (1 - filter!.strength) ** (dab.abr?.spacingRatio ?? 1),
              fingerPainting: false
            },
            finished
          );
          output.release();
          pending.delete(finished);
        }
      }
    } finally {
      for (const output of pending.values()) output.release();
    }
  }
}

function hexColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
