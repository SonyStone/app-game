import { createPatternRasterGpu } from '@app-game/abr-brush/patternRasterGpu';
import { createSampledTipTilePlanner } from '@app-game/abr-brush/sampledTipRaster';
import { createTipPyramid } from '@app-game/abr-brush/tipPyramid';
import { createTipRasterGpu } from '@app-game/abr-brush/tipRasterGpu';
import type { TgpuRoot } from 'typegpu';
import type { BrushResource } from '../resources';
import type { AbrRasterSettings } from './abrStamps';
import { abrBrushBudget, mipmappedBytes } from './abrTextureCache';

/** Device-owned pattern, sampled-tip and secondary-tip rasterizer sources for the current preset.
 * Sources persist across strokes while their resource ID is unchanged. Preparation is split into a
 * CPU-only plan, which validates budgets without side effects, and an apply step that allocates.
 */
export function createAbrPresetSources(root: TgpuRoot, budget = abrBrushBudget) {
  let pattern: PatternSource | undefined;
  let sampled: TipSource | undefined;
  let secondary: TipSource | undefined;

  return {
    /** Four-level pattern rasterizer; key changes whenever the source is replaced. */
    get pattern() {
      return pattern;
    },
    /** Primary sampled-tip row planner for ordinary sampled Paintbrush strokes. */
    get sampled() {
      return sampled;
    },
    /** Secondary (dual) tip row planner. */
    get secondary() {
      return secondary;
    },
    /** Decides which sources to keep or build and checks every budget, including the textures
     * that will be uploaded for required. Builds CPU pyramids only; throws without changing state.
     */
    plan: (value: AbrRasterSettings, required: readonly BrushResource[]) =>
      planPresetSources({ pattern, sampled, secondary }, value, required, budget),
    /** Destroys sources the plan does not keep, then allocates planned ones.
     * On an allocation failure destroys every source and rethrows, leaving an empty state.
     */
    apply(plan: SourcePlan) {
      if (!plan.pattern.keep) {
        pattern?.gpu.destroy();
        pattern = undefined;
      }

      if (!plan.sampled.keep) {
        sampled?.gpu.destroy();
        sampled = undefined;
      }

      if (!plan.secondary.keep) {
        secondary?.gpu.destroy();
        secondary = undefined;
      }

      try {
        if (plan.pattern.create) {
          const resource = plan.pattern.create;
          pattern = {
            key: Symbol('pattern source'),
            id: resource.id,
            gpu: createPatternRasterGpu(root, { width: resource.width, height: resource.height, data: resource.pixels })
          };
        }

        if (plan.sampled.create) {
          sampled = createTipSource(root, plan.sampled.create, false);
        }

        if (plan.secondary.create) {
          secondary = createTipSource(root, plan.secondary.create, true);
        }
      } catch (error) {
        destroyAll();
        throw error;
      }
    },
    /** Resident source bytes, excluding pooled upload scratch. */
    bytes: () => (pattern?.gpu.bytes ?? 0) + (sampled?.bytes ?? 0) + (secondary?.bytes ?? 0),
    /** Retained tip-plan upload scratch. */
    pooledBytes: () => (sampled?.gpu.pooledBytes ?? 0) + (secondary?.gpu.pooledBytes ?? 0),
    /** Cached sampled-tip plan rows across both tip planners. */
    planRows: () => (sampled?.planner.rows ?? 0) + (secondary?.planner.rows ?? 0),
    destroy: destroyAll
  };

  function destroyAll() {
    pattern?.gpu.destroy();
    sampled?.gpu.destroy();
    secondary?.gpu.destroy();
    pattern = undefined;
    sampled = undefined;
    secondary = undefined;
  }
}

/** Result of plan(); pass it unchanged to apply(). */
export type SourcePlan = ReturnType<typeof planPresetSources>;

function planPresetSources(
  current: { pattern?: PatternSource; sampled?: TipSource; secondary?: TipSource },
  value: AbrRasterSettings,
  required: readonly BrushResource[],
  budget: number
) {
  const textureBytes = required.reduce((sum, resource) => sum + mipmappedBytes(resource), 0);

  const patternResource = value.values.useTexture ? value.pattern : undefined;
  const keepPattern = !!patternResource && current.pattern?.id === patternResource.id;
  const newPattern = patternResource && !keepPattern ? patternResource : undefined;
  const patternBytes = keepPattern ? current.pattern!.gpu.bytes : newPattern ? patternSourceBytes(newPattern) : 0;
  if (patternBytes > budget) {
    throw new Error('ABR pattern levels exceed the 64 MiB brush budget.');
  }

  const sampledResource = usesSampledSource(value) ? value.tip : undefined;
  const keepSampled = !!sampledResource && current.sampled?.id === sampledResource.id;
  const newSampled = sampledResource && !keepSampled ? planTipSource(sampledResource) : undefined;
  const sampledBytes = keepSampled ? current.sampled!.bytes : (newSampled?.bytes ?? 0);
  if (newSampled && textureBytes + sampledBytes + patternBytes > budget) {
    throw new Error('ABR mipmaps and sampled-tip pyramid exceed the 64 MiB GPU brush budget.');
  }

  // Computed secondary sources are already rasterized and use the same affine row planner.
  const secondaryResource = value.values.useDualBrush ? value.dual : undefined;
  const keepSecondary = !!secondaryResource && current.secondary?.id === secondaryResource.id;
  const newSecondary = secondaryResource && !keepSecondary ? planTipSource(secondaryResource) : undefined;
  const secondaryBytes = keepSecondary ? current.secondary!.bytes : (newSecondary?.bytes ?? 0);
  if (newSecondary && textureBytes + secondaryBytes + sampledBytes + patternBytes > budget) {
    throw new Error('ABR secondary tip pyramid exceeds the 64 MiB GPU brush budget.');
  }

  return {
    pattern: { keep: keepPattern, create: newPattern },
    sampled: { keep: keepSampled, create: newSampled },
    secondary: { keep: keepSecondary, create: newSecondary },
    /** Source bytes resident after apply, excluding coverage textures. */
    bytes: patternBytes + sampledBytes + secondaryBytes
  };
}

type PatternSource = { key: symbol; id: string; gpu: ReturnType<typeof createPatternRasterGpu> };

type TipSource = ReturnType<typeof createTipSource>;

/** Only detailed sampled Paintbrush strokes without brush projection use row-planned primary tips. */
function usesSampledSource(value: AbrRasterSettings) {
  return value.tipLodBias === undefined && value.values.tool.type === 'PbTl' && value.values.tipKind === 'sampledBrush' &&
    !(value.values.useShapeDynamics && value.values.shapeDynamics.brushProjection);
}

/** Four odd-sized levels can retain the full extent. Counts host pixels as well as packed GPU bytes,
 * matching createPatternRasterGpu's own accounting.
 */
function patternSourceBytes(resource: BrushResource) {
  let width = resource.width;
  let height = resource.height;
  let bytes = 0;
  for (let level = 0; level < 4; level++) {
    bytes += width * height + Math.ceil(width * height / 4) * 4 + 8;
    if (width % 2 === 0) {
      width /= 2;
    }

    if (height % 2 === 0) {
      height /= 2;
    }
  }

  return bytes;
}

function planTipSource(resource: BrushResource) {
  const levels = createTipPyramid({ width: resource.width, height: resource.height, data: resource.pixels });
  return { id: resource.id, levels, bytes: levels.reduce((sum, level) => sum + level.width * level.height + 16, 0) };
}

function createTipSource(root: TgpuRoot, plan: ReturnType<typeof planTipSource>, secondary: boolean) {
  return {
    ...plan,
    gpu: createTipRasterGpu(root, plan.levels),
    planner: createSampledTipTilePlanner(plan.levels, secondary)
  };
}
