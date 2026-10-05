import { common, d, std, tgpu, type TgpuBuffer, type TgpuRoot, type UniformFlag } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { worldToScreen, type Camera, type ViewSize } from '../camera';
import { emptySelection, isSelected, type SelectionMask, type SelectionPreview } from '../selectionMask';

/**
 * The selection's marching ants over the presented view. Each target renders the selection into a screen-sized mask,
 * then outlines the mask's edges with moving diagonal stripes. The mask holds the selection's tiles, drawn as quads
 * through the camera (pixels at least half selected count), and the shape being drawn on top of it, combined as its
 * mode says: replacing the selection, added to it, cut out of it, or intersected with it; or the selection shifted while
 * it is dragged; or nothing while the preview hides it. Stencil parity fills the shape's concave and crossing outlines as the even-odd selection rule does.
 *
 * Partly selected tiles are uploaded once per selection into a shared texture array; wholly selected or unselected
 * tiles need none. Past the array's capacity, more partial tiles show as wholly selected. Each canvas target owns its
 * screen-space buffers and masks, which it redraws only when the selection, the preview or its camera changes.
 */
export function createSelectionOverlay(root: TgpuRoot, format: GPUTextureFormat) {
  const stencil = (compare: GPUCompareFunction, passOp: GPUStencilOperation = 'keep', write = 0) => ({
    format: 'stencil8' as const,
    stencilReadMask: 1,
    stencilWriteMask: write,
    stencilFront: { compare, passOp },
    stencilBack: { compare, passOp }
  });
  const tiles = root.createRenderPipeline({
    attribs: instanceLayout.attrib,
    vertex: tileVertex,
    fragment: tileFragment,
    targets: { format: 'r8unorm' },
    depthStencil: stencil('always')
  });
  const parity = root.createRenderPipeline({
    vertex: shapeVertex,
    fragment: fillOne,
    targets: { format: 'r8unorm', writeMask: 0 },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: stencil('always', 'invert', 1)
  });
  const selectWhere = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: fillOne,
    targets: { format: 'r8unorm' },
    depthStencil: stencil('equal')
  });
  const clearWhere = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: fillZero,
    targets: { format: 'r8unorm' },
    depthStencil: stencil('equal')
  });
  const edges = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: selectionEdge,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  let mask: SelectionMask = emptySelection;
  let preview: SelectionPreview | undefined;
  /** Changes with the selection and with the preview, so that targets know to redraw their masks. */
  let version = 0;
  const shared = createSharedTiles(root);
  const targets = new Set<SelectionTarget>();

  return {
    /** Replaces the selection shown; tiles are uploaded at the next render. */
    set(next: SelectionMask) {
      if (next !== mask) {
        mask = next;
        shared.invalidate();
        version++;
      }
    },
    /** Shows a shape being drawn or the selection being dragged, or stops with `undefined`. */
    preview(next: SelectionPreview | undefined) {
      preview = next;
      version++;
    },
    /** Whether there is anything to outline, so that the ants are animated. */
    visible: () =>
      preview?.kind !== 'hidden' && (isSelected(mask) || (preview?.kind === 'shape' && preview.points.length >= 3)),
    /** Creates one canvas target's overlay state. GPU resources are allocated on its first visible selection. */
    target(): SelectionTarget {
      const target = createTarget();
      targets.add(target);
      return target;
    },
    /** Bytes currently allocated by the shared tiles and every target. */
    bytes: () => shared.bytes() + [...targets].reduce((sum, target) => sum + target.bytes(), 0),
    destroy() {
      for (const target of targets) target.destroy();
      shared.destroy();
    }
  };

  function createTarget(): SelectionTarget {
    let state: ReturnType<typeof createTargetBuffers> | undefined;
    let screen: ReturnType<typeof createScreenMask> | undefined;
    let signature = '';
    const release = () => {
      screen?.destroy();
      screen = undefined;
      signature = '';
    };
    const target: SelectionTarget = {
      render(view, camera, size, width, height, seconds, encoder) {
        // A shape of fewer than three points, such as a lasso just begun, encloses nothing yet.
        const shape = preview?.kind === 'shape' && preview.points.length >= 3 ? preview : undefined;
        if ((!isSelected(mask) && !shape) || preview?.kind === 'hidden') {
          release();
          return;
        }

        if (shape && shape.points.length > maxShapePoints) {
          throw new Error('The selection outline exceeds its point budget.');
        }

        state ??= createTargetBuffers(root);
        if (!screen || screen.width !== width || screen.height !== height) {
          screen?.destroy();
          screen = createScreenMask(root, state.settings, width, height);
          signature = '';
        }

        const nextSignature = `${version}|${camera.x},${camera.y},${camera.zoom},${camera.angle},${camera.mirrored},${size.width},${size.height},${width},${height}`;
        if (signature !== nextSignature) {
          const uploaded = shared.upload(mask);
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: screen.render,
                loadOp: 'clear',
                clearValue: [mask.outside === 255 && shape?.mode !== 'replace' ? 1 : 0, 0, 0, 0],
                storeOp: 'store'
              }
            ],
            depthStencilAttachment: {
              view: screen.stencilView,
              stencilClearValue: 0,
              stencilLoadOp: 'clear',
              stencilStoreOp: 'discard'
            }
          });
          try {
            if (shape?.mode !== 'replace') {
              const offset = preview?.kind === 'offset' ? preview.offset : { x: 0, y: 0 };
              const count = state.writeTiles(uploaded.entries, camera, size, offset);
              if (count) {
                tiles
                  .with(pass)
                  .with(state.tilesGroup(uploaded.texture))
                  .with(instanceLayout, state.instances())
                  .draw(6, count);
              }
            }

            if (shape) {
              const data = new Float32Array(maxShapePoints * 2);
              shape.points.forEach((point, index) => {
                const at = worldToScreen(point, camera, size);
                data[index * 2] = (at.x / size.width) * 2 - 1;
                data[index * 2 + 1] = 1 - (at.y / size.height) * 2;
              });
              state.points.write(data);
              parity
                .with(pass)
                .with(state.pointsGroup)
                .draw((shape.points.length - 2) * 3);
              if (shape.mode === 'intersect') {
                clearWhere.with(pass).withStencilReference(0).draw(3);
              } else if (shape.mode === 'subtract') {
                clearWhere.with(pass).withStencilReference(1).draw(3);
              } else {
                selectWhere.with(pass).withStencilReference(1).draw(3);
              }
            }
          } finally {
            pass.end();
          }

          signature = nextSignature;
        }

        state.settings.write(d.vec4f(seconds, width, height, width / size.width));
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
        edges.with(pass).with(screen.group).draw(3);
        pass.end();
      },
      bytes: () => (state?.bytes() ?? 0) + (screen ? screen.width * screen.height * 2 : 0),
      destroy() {
        release();
        state?.destroy();
        state = undefined;
        targets.delete(target);
      }
    };
    return target;
  }
}

/** The renderer's selection overlay. */
export type SelectionOverlay = ReturnType<typeof createSelectionOverlay>;

/** One canvas target's selection overlay. */
export type SelectionTarget = {
  /**
   * Encodes the outline after artwork presentation into `encoder`, which the caller submits. Never writes into
   * document/cache textures. Updates this target's buffers, so submit before rendering the same target again.
   */
  render(
    view: GPUTextureView,
    camera: Camera,
    size: ViewSize,
    width: number,
    height: number,
    seconds: number,
    encoder: GPUCommandEncoder
  ): void;
  bytes(): number;
  /** Releases this target's buffers and mask; the shared overlay stays usable. */
  destroy(): void;
};

/** Most outline points of a shape being drawn, as the lasso keeps. */
const maxShapePoints = 4096;

/**
 * The selection's partly selected tiles in a texture array, uploaded once per selection, and every tile's place:
 * its tile coordinates and its array layer, or {@link fullTile} or {@link emptyTile} for uniform tiles.
 */
function createSharedTiles(root: TgpuRoot) {
  const limit = Math.min(root.device.limits.maxTextureArrayLayers, 2048);
  let texture: ReturnType<typeof createArray> | undefined;
  let uploaded: { texture: ReturnType<typeof createArray>; entries: TileEntry[] } | undefined;

  return {
    invalidate() {
      uploaded = undefined;
    },
    /** Uploads `mask`'s partial tiles when it changed, growing the array as needed, and lists every tile. */
    upload(mask: SelectionMask) {
      if (uploaded) {
        return uploaded;
      }

      const partial = [...mask.tiles].filter(([, tile]) => !uniformValue(tile));
      const layers = Math.min(limit, partial.length);
      if (!texture || texture.layers < layers) {
        texture?.destroy();
        texture = createArray(root, Math.min(limit, Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, layers))))));
      }

      const entries: TileEntry[] = [];
      let layer = 0;
      for (const [key, tile] of mask.tiles) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        const value = uniformValue(tile);
        if (value === undefined && layer < layers) {
          root.device.queue.writeTexture(
            { texture: root.unwrap(texture), origin: [0, 0, layer] },
            tile as Uint8Array<ArrayBuffer>,
            { bytesPerRow: TILE_SIZE },
            [TILE_SIZE, TILE_SIZE]
          );
          entries.push({ x, y, code: layer++ });
        } else {
          entries.push({ x, y, code: value === 0 ? emptyTile : fullTile });
        }
      }

      uploaded = { texture, entries };
      return uploaded;
    },
    bytes: () => (texture ? texture.layers * TILE_SIZE * TILE_SIZE : 0),
    destroy() {
      texture?.destroy();
      texture = undefined;
      uploaded = undefined;
    }
  };
}

/** A tile's coordinates and array layer, or the code of a uniform tile. */
type TileEntry = { x: number; y: number; code: number };

/** Codes of uniformly selected and unselected tiles, which have no array layer. */
const fullTile = -1;
const emptyTile = -2;

/** 0 or 255 for a uniform tile; `undefined` for a partial one. */
function uniformValue(tile: Uint8Array) {
  const first = tile[0]!;
  return (first === 0 || first === 255) && tile.every((value) => value === first) ? first : undefined;
}

function createArray(root: TgpuRoot, layers: number) {
  const texture = root.createTexture({ size: [TILE_SIZE, TILE_SIZE, layers], format: 'r8unorm' }).$usage('sampled');
  return Object.assign(texture, { layers });
}

/** Screen-space instances, shape points and edge settings of one target; they depend on that target's camera. */
function createTargetBuffers(root: TgpuRoot) {
  const points = root.createBuffer(d.arrayOf(d.vec2f, maxShapePoints)).$usage('storage');
  const settings = root.createBuffer(d.vec4f).$usage('uniform');
  const axes = root.createBuffer(d.vec4f).$usage('uniform');
  let instances: ReturnType<typeof createInstances> | undefined;
  let groups: { texture: unknown; group: ReturnType<typeof bindTiles> } | undefined;
  const createInstances = (capacity: number) =>
    Object.assign(root.createBuffer(d.arrayOf(tileInstance, capacity)).$usage('vertex'), { capacity });
  const bindTiles = (texture: ReturnType<typeof createArray>) =>
    root.createBindGroup(tilesLayout, { tiles: texture.createView(d.texture2dArray(d.f32)), axes });

  return {
    points,
    pointsGroup: root.createBindGroup(shapePointsLayout, { points }),
    settings,
    /**
     * Writes the instances of the tiles in view, shifted by `offset` document pixels, in clip space; returns how
     * many.
     */
    writeTiles(entries: readonly TileEntry[], camera: Camera, size: ViewSize, offset: { x: number; y: number }) {
      const clip = (x: number, y: number) => {
        const at = worldToScreen({ x, y }, camera, size);
        return [(at.x / size.width) * 2 - 1, 1 - (at.y / size.height) * 2] as const;
      };
      const [ox, oy] = clip(camera.x, camera.y);
      const [rx, ry] = clip(camera.x + TILE_SIZE, camera.y);
      const [dx, dy] = clip(camera.x, camera.y + TILE_SIZE);
      const across = [rx - ox, ry - oy] as const,
        down = [dx - ox, dy - oy] as const;
      axes.write(d.vec4f(across[0], across[1], down[0], down[1]));
      const data = new Float32Array(entries.length * 4);
      let count = 0;
      for (const entry of entries) {
        const [x, y] = clip(entry.x * TILE_SIZE + offset.x, entry.y * TILE_SIZE + offset.y);
        const xs = [x, x + across[0], x + down[0], x + across[0] + down[0]],
          ys = [y, y + across[1], y + down[1], y + across[1] + down[1]];
        if (Math.max(...xs) < -1 || Math.min(...xs) > 1 || Math.max(...ys) < -1 || Math.min(...ys) > 1) {
          continue;
        }

        data.set([x, y, entry.code, 0], count++ * 4);
      }

      if (count && (!instances || instances.capacity < count)) {
        instances?.destroy();
        instances = createInstances(2 ** Math.ceil(Math.log2(count)));
      }

      if (count) {
        root.device.queue.writeBuffer(root.unwrap(instances!), 0, data, 0, count * 4);
      }

      return count;
    },
    instances: () => instances!,
    tilesGroup(texture: ReturnType<typeof createArray>) {
      if (groups?.texture !== texture) {
        groups = { texture, group: bindTiles(texture) };
      }

      return groups.group;
    },
    bytes: () => maxShapePoints * 8 + 32 + (instances ? instances.capacity * 16 : 0),
    destroy() {
      points.destroy();
      settings.destroy();
      axes.destroy();
      instances?.destroy();
    }
  };
}

/** The screen mask and its stencil share the view's backing size and are kept across animation frames. */
function createScreenMask(
  root: TgpuRoot,
  settings: TgpuBuffer<typeof selectionEdgeLayout.entries.settings.uniform> & UniformFlag,
  width: number,
  height: number
) {
  const texture = root.createTexture({ size: [width, height], format: 'r8unorm' }).$usage('sampled', 'render');
  const stencil = root.device.createTexture({
    size: [width, height],
    format: 'stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
  return {
    width,
    height,
    render: root.unwrap(texture).createView(),
    stencilView: stencil.createView(),
    group: root.createBindGroup(selectionEdgeLayout, { mask: texture, settings }),
    destroy() {
      texture.destroy();
      stencil.destroy();
    }
  };
}

/** A tile: its corner in clip space and its array layer or uniform code. */
const tileInstance = d.struct({ tile: d.vec4f });
const instanceLayout = tgpu.vertexLayout(d.arrayOf(tileInstance), 'instance');
/** The partial tiles, and the clip-space vectors along a tile's top and left edges. */
const tilesLayout = tgpu.bindGroupLayout({
  tiles: { texture: d.texture2dArray(d.f32) },
  axes: { uniform: d.vec4f }
});
export const tileVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, tile: d.vec4f },
  out: { position: d.builtin.position, uv: d.vec2f, code: d.interpolate('flat', d.f32) }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(0, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(1, 1)]);
  const uv = corners[input.index]!;
  const axes = tilesLayout.$.axes;
  const position = std.add(input.tile.xy, std.add(std.mul(axes.xy, uv.x), std.mul(axes.zw, uv.y)));
  return { position: d.vec4f(position, 0, 1), uv, code: input.tile.z };
});
/** One where the tile's pixel under the fragment is at least half selected. */
export const tileFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f, code: d.interpolate('flat', d.f32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  if (input.code < -1.5) {
    return d.vec4f(0);
  }

  if (input.code < -0.5) {
    return d.vec4f(1);
  }

  const texel = std.clamp(d.vec2i(std.floor(std.mul(input.uv, TILE_SIZE))), d.vec2i(0), d.vec2i(TILE_SIZE - 1));
  const value = std.textureLoad(tilesLayout.$.tiles, texel, d.i32(input.code), 0).x;
  return d.vec4f(std.select(d.f32(0), d.f32(1), value >= 0.5));
});

/** A fan expanded to triangle-list vertex indices, using the same parity rule as pixel selection. */
const shapePointsLayout = tgpu.bindGroupLayout({ points: { storage: d.arrayOf(d.vec2f), access: 'readonly' } });
export const shapeVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position }
})((input) => {
  'use gpu';
  const corner = input.index % 3;
  let point = d.u32(0);
  if (corner !== 0) point = d.u32(input.index / 3) + corner;
  return { position: d.vec4f(shapePointsLayout.$.points[point]!, 0, 1) };
});
const fillOne = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(1);
});
const fillZero = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(0);
});

/** Time, backing dimensions and backing pixels per CSS pixel. */
const selectionEdgeLayout = tgpu.bindGroupLayout({
  mask: { texture: d.texture2d(d.f32) },
  settings: { uniform: d.vec4f }
});
/** A 3×3 edge kernel over the mask and moving diagonal stripes, in WebGPU's top-left origin. */
export const selectionEdge = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const position = d.vec2i(input.position.xy);
  const limit = d.vec2i(std.sub(selectionEdgeLayout.$.settings.yz, d.vec2f(1)));
  const step = d.i32(std.max(1, std.round(selectionEdgeLayout.$.settings.w)));
  const center = std.textureLoad(selectionEdgeLayout.$.mask, position, 0).r;
  let sum = d.f32(center * 9);
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      const sample = std.clamp(std.add(position, d.vec2i(x * step, y * step)), d.vec2i(0), limit);
      sum -= std.textureLoad(selectionEdgeLayout.$.mask, sample, 0).r;
    }
  const alpha = std.clamp(sum, 0, 1);
  const diagonal =
    (input.position.x + input.position.y) / selectionEdgeLayout.$.settings.w - selectionEdgeLayout.$.settings.x * 20;
  const color = std.select(d.f32(0), d.f32(1), (d.i32(std.floor(diagonal)) & 16) !== 0);
  return d.vec4f(d.vec3f(color * alpha), alpha);
});
