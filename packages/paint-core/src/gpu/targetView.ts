import { d, type TgpuBindGroup, type TgpuBuffer, type TgpuRoot, type UniformFlag } from 'typegpu';
import type { Camera, ViewSize } from '../camera';
import type { createLassoOverlay } from './lassoOverlay';
import * as shader from './shaders';
import { createViewDamage } from './viewDamage';
import { createViewFallback } from './viewFallback';
import type { createVirtualTexture } from './virtualTexture';

/**
 * Canvas targets attached to one renderer. Targets share tile caches, pipelines and the device; each keeps its own
 * composed viewport, cold-loading fallback, damage, virtual-texture page demand and selection overlay.
 * Drawing is serialized by the document runtime.
 */
export function createTargetViews(
  root: TgpuRoot,
  format: GPUTextureFormat,
  deps: {
    virtual: ReturnType<typeof createVirtualTexture> | undefined;
    lasso: ReturnType<typeof createLassoOverlay>;
    /** Builds the error thrown when a canvas cannot provide a WebGPU context. */
    contextError: () => Error;
  }
) {
  const targets = new Map<OffscreenCanvas | HTMLCanvasElement, TargetView>();

  return {
    /** Returns the canvas's target, configuring its context on first use unless an already configured `context`
     * is adopted. The target owns that context from then on and unconfigures it on release.
     */
    attach(canvas: OffscreenCanvas | HTMLCanvasElement, context?: GPUCanvasContext) {
      let target = targets.get(canvas);
      if (!target) {
        target = createTargetView(root, format, canvas, deps, context);
        targets.set(canvas, target);
      }

      return target;
    },

    get: (canvas: OffscreenCanvas | HTMLCanvasElement) => targets.get(canvas),
    all: () => targets.values(),

    /** Damages one document tile on every target. */
    mark(key: string) {
      for (const target of targets.values()) {
        target.damage.mark(key);
      }
    },

    /** Forces a full rebuild of every target, keeping cached tiles. */
    invalidate() {
      for (const target of targets.values()) {
        target.damage.invalidate();
      }
    },

    /** Detaches a target after any in-flight render. The caller owns its canvas element. */
    release(canvas: OffscreenCanvas | HTMLCanvasElement) {
      targets.get(canvas)?.release();
      targets.delete(canvas);
    },

    /** Viewport and fallback texture bytes across targets; lasso bytes are counted by the overlay. */
    bytes() {
      let sum = 0;
      for (const target of targets.values()) {
        sum += target.bytes();
      }

      return sum;
    },

    destroy() {
      for (const target of targets.values()) {
        target.release();
      }

      targets.clear();
    }
  };
}

/** The renderer's attached canvas targets. */
export type TargetViews = ReturnType<typeof createTargetViews>;

/** One canvas target's presentation state. */
export type TargetView = ReturnType<typeof createTargetView>;

function createTargetView(
  root: TgpuRoot,
  format: GPUTextureFormat,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  deps: Parameters<typeof createTargetViews>[2],
  configured?: GPUCanvasContext
) {
  const context = configured ?? canvas.getContext('webgpu');
  if (!context) {
    throw deps.contextError();
  }

  if (!configured) {
    context.configure({ device: root.device, format, alphaMode: 'opaque' });
  }

  let pages: ReturnType<NonNullable<typeof deps.virtual>['view']> | undefined;
  let lasso: ReturnType<typeof deps.lasso.target> | undefined;

  return {
    canvas,
    context,
    /** Composed viewport textures at the current backing size; undefined until the first render. */
    view: undefined as ViewTextures | undefined,
    /** Reprojects the last complete view while pages load; only with virtual texturing. */
    fallback: deps.virtual ? createViewFallback(root) : undefined,
    /** Camera and size of the last presented frame whose pages were all resident. */
    complete: undefined as { camera: Camera; size: ViewSize } | undefined,
    /** Signature of the last presented camera and backing size. */
    presented: '',
    /** Presented signature whose brush preview stays on screen until its refreshed overview is resident. */
    hold: '',
    damage: createViewDamage(),

    /** This target's virtual-texture page demand, registered on first use. */
    pages() {
      if (deps.virtual) {
        pages ??= deps.virtual.view();
      }

      return pages;
    },

    /** This target's selection overlay state, allocated on first use. */
    lasso() {
      return (lasso ??= deps.lasso.target());
    },

    /** Replaces the viewport textures for a new backing size, keeping a reprojection of the last complete view. */
    resize(width: number, height: number) {
      if (this.view && this.complete) {
        this.fallback?.capture(root.unwrap(this.view.composed), this.complete.camera, this.complete.size);
      }

      this.complete = undefined;
      this.view?.destroy();
      canvas.width = width;
      canvas.height = height;
      this.view = createViewTextures(root, width, height);
      this.presented = '';
      this.hold = '';
      return this.view;
    },

    /** Composition changed: the saved reprojection and any held preview no longer describe the document. */
    dropFallback() {
      this.complete = undefined;
      this.hold = '';
      this.fallback?.clear();
    },

    /** Keeps the presented brush preview until the committed overview is resident at the same camera. */
    holdPreview() {
      this.hold = this.presented;
    },

    bytes() {
      // Two rgba16float composition textures and three rgba8unorm images.
      return (this.fallback?.bytes() ?? 0) + (this.view ? this.view.width * this.view.height * (8 * 2 + 4 * 3) : 0);
    },

    /** Releases every GPU resource of this target and unconfigures its context. */
    release() {
      this.view?.destroy();
      this.view = undefined;
      this.fallback?.destroy();
      pages?.release();
      pages = undefined;
      lasso?.destroy();
      lasso = undefined;
      context.unconfigure();
    }
  };
}

/**
 * Ping-pong composition textures, the per-layer scratch target and the presented image of one target. Layers blend
 * into `a`/`b` in rgba16float, so rounding does not accumulate across many translucent layers; `layer` holds 8-bit
 * tile pixels, `clip` a copy of the clipping base layer's pixels for the layers clipped to it, and `composed` the
 * 8-bit result.
 */
export type ViewTextures = ReturnType<typeof createViewTextures>;

function createViewTextures(root: TgpuRoot, width: number, height: number) {
  const texture = <F extends 'rgba8unorm' | 'rgba16float'>(format: F) =>
    root.createTexture({ size: [width, height], format }).$usage('sampled', 'render');
  const a = texture(compositionFormat),
    b = texture(compositionFormat),
    layer = texture('rgba8unorm'),
    clip = texture('rgba8unorm'),
    composed = texture('rgba8unorm');
  const slots: { settings: TgpuBuffer<d.Vec4f> & UniformFlag; fromA: TgpuBindGroup; fromB: TgpuBindGroup }[] = [];
  return {
    width,
    height,
    a,
    b,
    layer,
    clip,
    composed,
    aRender: root.unwrap(a).createView(),
    bRender: root.unwrap(b).createView(),
    layerRender: root.unwrap(layer).createView(),
    composedRender: root.unwrap(composed).createView(),
    /** Sources of the resolve pass that writes the final ping-pong texture into `composed`. */
    resolveA: root.createBindGroup(shader.presentLayout, { image: a }),
    resolveB: root.createBindGroup(shader.presentLayout, { image: b }),
    /** Composite bindings for the frame's `slot`-th visible layer. Distinct settings buffers let one encoder
     * hold every layer's composite pass; slots are created on first use and reused by later frames.
     */
    composite(slot: number) {
      const existing = slots[slot];
      if (existing) {
        return existing;
      }

      const settings = root.createBuffer(d.vec4f).$usage('uniform');
      const created = {
        settings,
        fromA: root.createBindGroup(shader.compositeLayout, { base: a, layer, clip, settings }),
        fromB: root.createBindGroup(shader.compositeLayout, { base: b, layer, clip, settings })
      };
      slots[slot] = created;
      return created;
    },
    present: root.createBindGroup(shader.presentLayout, { image: composed }),
    destroy() {
      a.destroy();
      b.destroy();
      layer.destroy();
      clip.destroy();
      composed.destroy();
      for (const slot of slots) {
        slot.settings.destroy();
      }
    }
  };
}

/** Format of the textures layers are blended into. */
export const compositionFormat = 'rgba16float';
