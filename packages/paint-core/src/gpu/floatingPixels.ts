import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import type { Camera, ViewSize } from '../camera';
import { transmittanceBlend } from './tileTextures';

/**
 * Display-only pixels lifted off a layer and shown moved, such as a transform in progress. The renderer draws them
 * into their layer's pixels before the layer is blended, so they take the layer's opacity, blend mode and clipping:
 * first the lifted pixels are cut out where they were, then drawn through `matrix`. The document is unchanged; the
 * edit that lifted them commits the result itself.
 */
export type FloatingPixels = {
  layerId: string;
  /** Where the pixels were lifted from, in document pixels; right and bottom are exclusive. */
  bounds: { left: number; top: number; right: number; bottom: number };
  /** Premultiplied RGBA8 pixels of `bounds`, row by row. Pixels with any alpha are cut out of the layer. */
  pixels: Uint8Array;
  /**
   * Affine transform `[a, b, c, d, e, f]` of document points, mapping `(x, y)` to `(a x + c y + e, b x + d y + f)`,
   * from where the pixels were lifted to where they are shown.
   */
  matrix: readonly [number, number, number, number, number, number];
  /** `smooth` filters the pixels (with mipmaps when minified); `pixels` takes the nearest pixel. */
  interpolation: 'smooth' | 'pixels';
};

/**
 * GPU state of the shown floating pixels: one texture with mipmaps, sized to the lifted pixels, and the passes that
 * cut them out of their layer and draw them moved. Changes report the document tiles whose screen area must be
 * redrawn through `damage`.
 */
export function createFloatingPixels(root: TgpuRoot, damage: (keys: readonly string[] | 'all') => void) {
  const cut = root.createRenderPipeline({
    vertex: floatingVertex,
    fragment: floatingCut,
    // Keeps the destination where the lifted pixels were transparent and clears it where they were not.
    targets: { format: 'rgba8unorm', blend: transmittanceBlend }
  });
  const draw = root.createRenderPipeline({
    vertex: floatingVertex,
    fragment: floatingDraw,
    targets: {
      format: 'rgba8unorm',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  const samplers = {
    smooth: root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' }),
    pixels: root.createSampler({ minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' })
  };
  // The cut and the draw pass of one frame need their own uniforms, since both are submitted together.
  const uniforms = {
    cut: root.createBuffer(floatingUniform).$usage('uniform'),
    draw: root.createBuffer(floatingUniform).$usage('uniform')
  };
  let shown: (FloatingPixels & { resources: ReturnType<typeof upload> }) | undefined;

  return {
    /** Layer whose pixels float, if any. */
    layerId: () => shown?.layerId,

    /** Shows `floating`, replacing any shown before, or hides floating pixels for `undefined`. Uploads the pixels. */
    set(floating: FloatingPixels | undefined) {
      if (shown) {
        damage(area(shown));
        shown.resources.destroy();
        shown = undefined;
      }

      if (floating) {
        shown = { ...floating, resources: upload(floating) };
        damage(area(shown));
      }
    },

    /** Moves the shown pixels without uploading them again. */
    move(matrix: FloatingPixels['matrix'], interpolation: FloatingPixels['interpolation']) {
      if (!shown) {
        return;
      }

      damage(area(shown));
      shown.matrix = matrix;
      shown.interpolation = interpolation;
      damage(area(shown));
    },

    /**
     * Encodes the cut and the draw into `target`, the 8-bit premultiplied pixels of the floating layer, within
     * `region` of a `width` × `height` view showing `camera`.
     */
    render(
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      region: { x: number; y: number; width: number; height: number },
      camera: Camera,
      size: ViewSize
    ) {
      if (!shown) {
        return;
      }

      const { bounds, matrix, resources } = shown;
      const width = bounds.right - bounds.left,
        height = bounds.bottom - bounds.top;
      uniforms.cut.write(uniform([1, 0, 0, 1, 0, 0], bounds, width, height, camera, size));
      uniforms.draw.write(uniform(matrix, bounds, width, height, camera, size));
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      cut.with(pass).with(resources.cut).draw(6);
      draw.with(pass).with(resources[shown.interpolation]).draw(6);
      pass.end();
    },

    /** GPU memory of the shown pixels. */
    bytes: () => shown?.resources.bytes ?? 0,

    destroy() {
      shown?.resources.destroy();
      shown = undefined;
      uniforms.cut.destroy();
      uniforms.draw.destroy();
    }
  };

  /** Uploads the pixels with a full mip chain and binds them to both passes. */
  function upload(floating: FloatingPixels) {
    const width = floating.bounds.right - floating.bounds.left,
      height = floating.bounds.bottom - floating.bounds.top;
    const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const texture = root
      .createTexture({ size: [width, height], format: 'rgba8unorm', mipLevelCount })
      .$usage('sampled', 'render');
    root.device.queue.writeTexture(
      { texture: root.unwrap(texture) },
      floating.pixels as Uint8Array<ArrayBuffer>,
      { bytesPerRow: width * 4 },
      [width, height]
    );
    texture.generateMipmaps();
    const group = (sampler: keyof typeof samplers, buffer: keyof typeof uniforms) =>
      root.createBindGroup(floatingLayout, { transform: uniforms[buffer], image: texture, sampler: samplers[sampler] });

    return {
      cut: group('pixels', 'cut'),
      smooth: group('smooth', 'draw'),
      pixels: group('pixels', 'draw'),
      // A full mip chain adds a third.
      bytes: Math.round((width * height * 4 * 4) / 3),
      destroy: () => texture.destroy()
    };
  }
}

/** The renderer's floating pixels. */
export type FloatingPixelsState = ReturnType<typeof createFloatingPixels>;

/** Tiles under the lifted pixels and under where they are shown; too many invalidate the whole view instead. */
function area({ bounds, matrix }: FloatingPixels): readonly string[] | 'all' {
  const [a, b, c, d, e, f] = matrix;
  const corners = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.left, bounds.bottom],
    [bounds.right, bounds.bottom]
  ].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f] as const);
  const shownAt = {
    left: Math.min(...corners.map(([x]) => x)),
    top: Math.min(...corners.map(([, y]) => y)),
    right: Math.max(...corners.map(([x]) => x)),
    bottom: Math.max(...corners.map(([, y]) => y))
  };
  if (tileCount(bounds) + tileCount(shownAt) > maxDamageTiles) {
    return 'all';
  }

  return [...tileKeys(bounds), ...tileKeys(shownAt)];
}

/** Number of document tiles overlapping `bounds`. */
function tileCount(bounds: FloatingPixels['bounds']) {
  return (
    (Math.ceil(bounds.right / TILE_SIZE) - Math.floor(bounds.left / TILE_SIZE)) *
    (Math.ceil(bounds.bottom / TILE_SIZE) - Math.floor(bounds.top / TILE_SIZE))
  );
}

/** Keys of the document tiles overlapping `bounds`. */
function tileKeys(bounds: FloatingPixels['bounds']): string[] {
  const keys: string[] = [];
  for (let y = Math.floor(bounds.top / TILE_SIZE); y < Math.ceil(bounds.bottom / TILE_SIZE); y++) {
    for (let x = Math.floor(bounds.left / TILE_SIZE); x < Math.ceil(bounds.right / TILE_SIZE); x++) {
      keys.push(`${x},${y}`);
    }
  }

  return keys;
}

/** Marking more tiles than this redraws the whole view, which costs no more. */
const maxDamageTiles = 1024;

/**
 * Uniforms of one pass: `linear` and `translation` map texture coordinates (0–1) to document positions relative to
 * the camera, which keeps precision far from the origin; the rest describes the camera like the tile shader's.
 */
function uniform(
  matrix: FloatingPixels['matrix'],
  bounds: FloatingPixels['bounds'],
  width: number,
  height: number,
  camera: Camera,
  size: ViewSize
) {
  const [a, b, c, d2, e, f] = matrix;
  return {
    // The pixels span `width` × `height` from the bounds' corner, then go through `matrix`.
    linear: d.vec4f(a * width, b * width, c * height, d2 * height),
    translation: d.vec2f(
      a * bounds.left + c * bounds.top + e - camera.x,
      b * bounds.left + d2 * bounds.top + f - camera.y
    ),
    size: d.vec2f(size.width, size.height),
    texels: d.vec2f(width, height),
    zoom: camera.zoom,
    angle: camera.angle,
    mirror: camera.mirrored ? -1 : 1,
    padding: 0
  };
}

const floatingUniform = d.struct({
  linear: d.vec4f,
  translation: d.vec2f,
  size: d.vec2f,
  texels: d.vec2f,
  zoom: d.f32,
  angle: d.f32,
  mirror: d.f32,
  padding: d.f32
});

const floatingLayout = tgpu.bindGroupLayout({
  transform: { uniform: floatingUniform },
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' }
});

/** A quad of the floating pixels in their document position, projected like the tile shader's tiles. */
const floatingVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(0, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(1, 1)]);
  const uv = corners[input.index]!;
  const transform = floatingLayout.$.transform;
  const p = d.vec2f(
    transform.linear.x * uv.x + transform.linear.z * uv.y + transform.translation.x,
    transform.linear.y * uv.x + transform.linear.w * uv.y + transform.translation.y
  );
  const x = p.x * transform.mirror;
  const c = std.cos(transform.angle);
  const s = std.sin(transform.angle);
  const screen = std.mul(d.vec2f(x * c - p.y * s, x * s + p.y * c), transform.zoom);
  return {
    position: d.vec4f((screen.x * 2) / transform.size.x, (-screen.y * 2) / transform.size.y, 0, 1),
    uv
  };
});

/** Outputs full alpha over every lifted pixel with any alpha, so the cut pass clears it from the layer. */
const floatingCut = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const texels = floatingLayout.$.transform.texels;
  const texel = d.vec2i(std.clamp(std.floor(std.mul(input.uv, texels)), d.vec2f(0), std.sub(texels, d.vec2f(1))));
  const alpha = std.textureLoad(floatingLayout.$.image, texel, 0).w;
  return std.select(d.vec4f(0), d.vec4f(1), alpha > 0);
});

/** Samples the premultiplied floating pixels for source-over blending. */
const floatingDraw = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureSample(floatingLayout.$.image, floatingLayout.$.sampler, input.uv);
});
