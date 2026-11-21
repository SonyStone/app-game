import type { BlendMode } from './document';
import { coverageFactors, maskCoverage, type LayerMask } from './layerMask';
import { blendModes } from './layerMerge';
import { groupMode, shownMask, type CompositeGroup, type ShownLayer } from './layerTree';
import { unpackTile, type TileData } from './tilePixels';

/**
 * How the layer stack composites with folders that composite on their own (see `CompositeGroup`): one walk over the
 * shown layers, shared by the screen (`frameComposer`) and every composite made on the CPU (merges, export), so both
 * enter and leave folders and resolve clipping the same way, and the CPU compositor that follows it.
 *
 * A stack where `isFlatStack` holds needs none of this: compositors keep their flat path for it.
 */

/** A shown layer, or a folder that composites on its own with the items inside it, bottom first. */
export type StackItem =
  { type: 'layer'; layer: ShownLayer } | { type: 'group'; group: CompositeGroup; items: StackItem[] };

/**
 * The items of `layers`, as `shownLayers` returns them: layers in a folder that composites on its own are inside its
 * item, which takes the place of its first layer; other layers stay where they are. Folders without a raster layer
 * have no item.
 */
export function stackItems(layers: readonly ShownLayer[]): StackItem[] {
  const root: StackItem[] = [];
  const contents = new Map<CompositeGroup, StackItem[]>();
  const itemsOf = (group: CompositeGroup | undefined): StackItem[] => {
    if (!group) {
      return root;
    }

    let items = contents.get(group);
    if (!items) {
      items = [];
      contents.set(group, items);
      itemsOf(group.parent).push({ type: 'group', group, items });
    }

    return items;
  };
  for (const layer of layers) {
    itemsOf(layer.group).push({ type: 'layer', layer });
  }

  return root;
}

/** The clipping base a clipped layer shows through: the raster right below it, or a folder's coverage. */
export type StackClip = { type: 'layer' } | { type: 'group'; group: CompositeGroup };

/**
 * What a compositor does at each step of {@link walkStack}. Every step works on the current level, an accumulated
 * image; `enter` pushes a new one and `leave` pops it.
 */
export type StackVisitor = {
  /**
   * Composites `layer` onto the current level, its alpha multiplied by `clip`'s coverage when given. With `base`,
   * clipped layers follow and use the layer's own pixels as their clipping base. Returns whether it drew anything: a
   * layer with nothing in the area composited is a hidden clipping base.
   */
  layer(layer: ShownLayer, clip: StackClip | undefined, base: boolean): Promise<boolean> | boolean;
  /**
   * Pushes a level for `group`: transparent for `isolated` and `coverage`, a copy of the current level for `fade`.
   * Ends any clipping base the current level kept.
   */
  enter(group: CompositeGroup, mode: StackLevel): Promise<void> | void;
  /**
   * Pops `group`'s level. When `drew`, an `isolated` level is composited onto the level below with the folder's blend
   * mode and opacity, and a `fade` level replaces it, interpolated from it by the folder's opacity; a `coverage` level
   * is not composited. With `keep`, clipped siblings follow: the popped level's alpha is their clipping base.
   */
  leave(group: CompositeGroup, mode: StackLevel, drew: boolean, keep: boolean): Promise<void> | void;
};

/** Why a level is pushed; see {@link StackVisitor}. */
export type StackLevel = 'isolated' | 'fade' | 'coverage';

/**
 * Walks `items` bottom to top, calling `visitor` as the stack composites. Hidden layers and layers at zero opacity are
 * skipped, and so are folders that do not show or whose opacity is 0. A clipped layer's base is the sibling right
 * below it, a layer or a folder (`ShownLayer.clipGroup`); clipped layers whose base is hidden, at zero opacity or drew
 * nothing are skipped. A Pass Through folder at full strength that is a clipping base composites its layers in place,
 * then once more on a level of their own for its coverage; a fading one does the same after its fade. Returns whether
 * anything was drawn.
 */
export async function walkStack(items: readonly StackItem[], visitor: StackVisitor): Promise<boolean> {
  /** The base of the clipped layers that come next; see `clipped` below for a stack without folders. */
  let base: 'none' | 'hidden' | StackClip = 'none';
  let drew = false;
  for (const [index, item] of items.entries()) {
    const next = items[index + 1];
    const clipsNext = next?.type === 'layer' && !!next.layer.clipping;
    if (item.type === 'layer') {
      const { layer } = item;
      // As on a flat stack, a clipped layer with nothing below shows as an ordinary layer and is a base itself.
      const clipped = !!layer.clipGroup || (!!layer.clipping && base !== 'none');
      let clip: StackClip | undefined;
      if (clipped) {
        if (base === 'none' || base === 'hidden') {
          continue;
        }

        // A layer clipped to a folder that composited nothing here, such as an empty one, has a hidden base.
        if (layer.clipGroup && (base.type !== 'group' || base.group !== layer.clipGroup)) {
          continue;
        }

        clip = base;
      }

      if (!layer.visible || layer.opacity <= 0) {
        if (!clipped) {
          base = 'hidden';
        }

        continue;
      }

      const did = await visitor.layer(layer, clip, !clipped && clipsNext);
      drew ||= did;
      if (!clipped) {
        base = did ? { type: 'layer' } : 'hidden';
      }

      continue;
    }

    const { group } = item;
    if (!group.visible || group.opacity <= 0) {
      base = 'hidden';
      continue;
    }

    const mode = groupMode(group);
    let did: boolean;
    if (mode === 'pass-through') {
      did = await walkStack(item.items, visitor);
    } else {
      await visitor.enter(group, mode);
      did = await walkStack(item.items, visitor);
      await visitor.leave(group, mode, did, mode === 'isolated' && clipsNext && did);
    }

    if (mode !== 'isolated' && clipsNext && did) {
      await visitor.enter(group, 'coverage');
      await walkStack(item.items, visitor);
      await visitor.leave(group, 'coverage', true, true);
    }

    drew ||= did;
    base = did ? { type: 'group', group } : 'hidden';
  }

  return drew;
}

/**
 * Composites `layers`, as `shownLayers` returns them, over `pixels` pixels on the CPU, following {@link walkStack}
 * with the composite shader's math (`compositeFragment`): returns premultiplied encoded-sRGB RGBA, 0–1, kept in 32-bit
 * floats throughout, as the screen keeps its levels in 16-bit floats until output. `read` gives a layer's own
 * premultiplied RGBA8 pixels in the area, or nothing where it has none; `linear` is the document's `linearBlending`.
 * `backdrop`, when given, is what the stack composites onto (transparent otherwise) and is not changed.
 *
 * Masks apply as the screen applies them (see `LayerMask`): `readMask` gives a mask's stored coverage in the area, one
 * byte per pixel. An enabled mask scales its layer's pixels before clipping and opacity, so the layers clipped to it
 * see the masked shape; a folder's scales its composite, or for a fading folder the fade, and its coverage as a
 * clipping base. Throws for a masked layer without `readMask`; {@link tileSources} reads both for one tile.
 */
export async function composeStack(
  layers: readonly ShownLayer[],
  pixels: number,
  read: (layer: ShownLayer) => Promise<Uint8Array | undefined> | Uint8Array | undefined,
  linear: boolean,
  backdrop?: Float32Array,
  readMask?: (mask: LayerMask) => Promise<Uint8Array> | Uint8Array
): Promise<Float32Array> {
  const levels: { image: Float32Array; kept?: Float32Array; rasterBase?: Float32Array }[] = [
    { image: backdrop ? backdrop.slice() : new Float32Array(pixels * 4) }
  ];
  /** The effective coverage of `mask` in the area, 0–1 per pixel. */
  const factors = async (mask: LayerMask) => {
    if (!readMask) {
      throw new Error('Read the masks of a masked stack to composite it.');
    }

    return coverageFactors(await readMask(mask), mask.inverted);
  };
  await walkStack(stackItems(layers), {
    async layer(layer, clip, base) {
      const level = levels.at(-1)!;
      if (!clip) {
        level.kept = undefined;
        level.rasterBase = undefined;
      }

      const own = await read(layer);
      if (!own) {
        return false;
      }

      const mask = shownMask(layer);
      const source = mask ? scaledPixels(normalized(own), await factors(mask)) : normalized(own);
      const coverage = clip ? (clip.type === 'layer' ? level.rasterBase : level.kept) : undefined;
      if (!clip && base) {
        level.rasterBase = source;
      }

      level.image = compositePixels(level.image, source, coverage, layer.opacity, layer.blend, linear);
      return true;
    },
    enter(_group, mode) {
      const level = levels.at(-1)!;
      level.kept = undefined;
      levels.push({ image: mode === 'fade' ? level.image.slice() : new Float32Array(pixels * 4) });
    },
    async leave(group, mode, drew, keep) {
      const popped = levels.pop()!.image;
      const level = levels.at(-1)!;
      const k = group.mask && (await factors(group.mask));
      // A fade's mask scales how far it goes; any other level's mask scales the folder's own composite.
      const image = k && mode !== 'fade' ? scaledPixels(popped, k) : popped;
      if (drew && mode === 'isolated') {
        level.image = compositePixels(level.image, image, undefined, group.opacity, group.blend as BlendMode, linear);
      } else if (drew && mode === 'fade') {
        level.image = fadePixels(level.image, image, group.opacity, linear, k);
      }

      level.kept = keep ? image : undefined;
    }
  });
  return levels[0]!.image;
}

/**
 * Readers of one tile for {@link composeStack}: `read` for a layer's unpacked pixels at tile `key`, `readMask` for a
 * mask's stored coverage there. `load` gives a tile version's bytes, from storage when it is there.
 */
export function tileSources(key: string, load: (data: TileData) => Promise<Uint8Array> | Uint8Array) {
  return {
    read: async (layer: ShownLayer) => {
      const data = layer.tiles.get(key);
      return data && unpackTile(await load(data));
    },
    readMask: async (mask: LayerMask) => {
      const data = mask.tiles.get(key);
      return maskCoverage(data && (await load(data)), mask.outside);
    }
  };
}

/** Premultiplied `image` with every pixel scaled by `factors`, one 0–1 value per pixel; returns a new one. */
export function scaledPixels(image: Float32Array, factors: Float32Array): Float32Array {
  const out = new Float32Array(image.length);
  for (let index = 0; index < factors.length; index++) {
    const k = factors[index]!;
    for (let channel = 0; channel < 4; channel++) {
      out[index * 4 + channel] = image[index * 4 + channel]! * k;
    }
  }

  return out;
}

/** RGBA8 pixels as 0–1 floats. */
export function normalized(pixels: Uint8Array): Float32Array {
  const out = new Float32Array(pixels.length);
  for (let index = 0; index < pixels.length; index++) {
    out[index] = pixels[index]! / 255;
  }

  return out;
}

/** Premultiplied 0–1 floats clamped and rounded to RGBA8, as the screen's 8-bit resolve stores them. */
export function quantized(image: Float32Array): Uint8Array {
  const out = new Uint8Array(image.length);
  for (let index = 0; index < image.length; index++) {
    out[index] = Math.round(Math.min(1, Math.max(0, image[index]!)) * 255);
  }

  return out;
}

/**
 * `source` composited onto `base` with `blend` and `opacity`, its alpha first multiplied by the alpha of `clip` when
 * given, as `compositeFragment` does it: with `linear`, both are decoded from sRGB before blending and the result is
 * encoded again. All images are premultiplied 0–1 RGBA of the same size; returns a new one.
 */
export function compositePixels(
  base: Float32Array,
  source: Float32Array,
  clip: Float32Array | undefined,
  opacity: number,
  blend: BlendMode,
  linear: boolean
): Float32Array {
  const mode = blendModes.indexOf(blend);
  const out = new Float32Array(base.length);
  const b = [0, 0, 0, 0],
    s = [0, 0, 0, 0];
  for (let index = 0; index < base.length; index += 4) {
    const k = clip ? clip[index + 3]! : 1;
    for (let channel = 0; channel < 4; channel++) {
      b[channel] = base[index + channel]!;
      s[channel] = source[index + channel]! * k;
    }

    if (linear) {
      decode(b);
      decode(s);
    }

    const alpha = s[3]! * opacity;
    const ba = b[3]!;
    for (let channel = 0; channel < 3; channel++) {
      const cb = b[channel]! / Math.max(ba, 0.000001);
      const cs = s[channel]! / Math.max(s[3]!, 0.000001);
      b[channel] = b[channel]! * (1 - alpha) + (cs * (1 - ba) + blendChannel(cb, cs, mode) * ba) * alpha;
    }

    b[3] = alpha + ba * (1 - alpha);
    if (linear) {
      encode(b);
    }

    out.set(b, index);
  }

  return out;
}

/**
 * `from` interpolated towards `to` by `amount` in premultiplied working space, linear light with `linear`, as
 * `mixPremultiplied` does it: a fading Pass Through folder's result over the backdrop it entered with. `factors`, one
 * 0–1 value per pixel such as a folder mask's coverage, scale `amount` pixel by pixel.
 */
export function fadePixels(
  from: Float32Array,
  to: Float32Array,
  amount: number,
  linear: boolean,
  factors?: Float32Array
): Float32Array {
  const out = new Float32Array(from.length);
  const a = [0, 0, 0, 0],
    b = [0, 0, 0, 0];
  for (let index = 0; index < from.length; index += 4) {
    const t = factors ? amount * factors[index / 4]! : amount;
    if (t <= 0 || t >= 1) {
      // As `mixPremultiplied`, which returns either end unchanged.
      out.set((t <= 0 ? from : to).subarray(index, index + 4), index);
      continue;
    }

    for (let channel = 0; channel < 4; channel++) {
      a[channel] = from[index + channel]!;
      b[channel] = to[index + channel]!;
    }

    if (linear) {
      decode(a);
      decode(b);
    }

    for (let channel = 0; channel < 4; channel++) {
      a[channel] = a[channel]! + (b[channel]! - a[channel]!) * t;
    }

    if (linear) {
      encode(a);
    }

    out.set(a, index);
  }

  return out;
}

/** `compositeFragment`'s separable modes, by index in `blendModes`: Normal, Multiply, Screen and Overlay. */
function blendChannel(cb: number, cs: number, mode: number) {
  if (mode === 1) {
    return cb * cs;
  }

  if (mode === 2) {
    return 1 - (1 - cb) * (1 - cs);
  }

  if (mode === 3) {
    return cb > 0.5 ? 1 - 2 * (1 - cb) * (1 - cs) : 2 * cb * cs;
  }

  return cs;
}

/** `decodePremultiplied` of `@app-game/abr-brush/effects`, in place: premultiplied sRGB to linear light. */
function decode(pixel: number[]) {
  transfer(pixel, (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
}

/** `encodePremultiplied` of `@app-game/abr-brush/effects`, in place: premultiplied linear light to sRGB. */
function encode(pixel: number[]) {
  transfer(pixel, (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
}

function transfer(pixel: number[], curve: (value: number) => number) {
  const alpha = pixel[3]!;
  if (alpha <= 0) {
    pixel.fill(0);
    return;
  }

  for (let channel = 0; channel < 3; channel++) {
    pixel[channel] = curve(Math.min(1, Math.max(0, pixel[channel]! / alpha))) * alpha;
  }
}
