import {
  createFontLibrary,
  loadPsdViewer,
  openPsd,
  openPsdLikePhotoshop,
  type PsdFailure,
  type PsdFontLibrary,
  type PsdLayerNode,
  type PsdRender,
  type PsdRenderSettings,
  type PsdViewerDocument
} from '@app-game/psd/viewer';
import { addFontFile, type SessionFont } from '../fonts/addFontFile';
import { makePerformanceRecorder } from '../telemetry/performance';
import {
  requiresWindowedRendering,
  windowWorkPixels,
  type BlendingDetection,
  type PsdReply,
  type PsdRequest
} from './protocol';

/**
 * The worker side of the protocol, independent of the worker global so tests can drive it directly. It holds one open
 * document and the full-depth composites of its two latest renders, so the UI can still compare the render it shows
 * while the next one is already running; opening another document closes the previous one, even when the new one
 * fails or waits for an answer to a Photoshop prompt. Small documents open as Photoshop opens them; large canvases
 * use the strict, lazy reader because recovery still decodes whole channels. Large-canvas requests never run
 * whole-document compositing, comparison or blending detection. Window calls admit up to 2 GiB live and count
 * the retained host input; typed budget refusals travel to the UI as ordinary failed replies.
 * The renders a blending
 * detection made wait for the next render request, which takes the one with its settings and visibility instead of
 * compositing again; the others are freed then. It also holds the font library, created on first use and kept across
 * documents, for imported cache mixing and optional rerasterization. Adding fonts releases prepared renders. Requests
 * run one at a time in arrival order. `post` sends a reply with the buffers to transfer.
 */
export function makePsdWorkerHost(send: (reply: PsdReply, transfer: Transferable[]) => void) {
  const telemetry = makePerformanceRecorder();
  function post(reply: PsdReply, transfer: Transferable[]) {
    telemetry.record(
      'transfer.bytes',
      performance.now(),
      transfer.reduce<number>((sum, value) => sum + (value instanceof ArrayBuffer ? value.byteLength : 0), 0)
    );
    send({ ...reply, performance: telemetry.take() }, transfer);
  }

  let document: { id: number; viewer: PsdViewerDocument; inputBytes: number } | undefined;
  let fonts: PsdFontLibrary | undefined;
  const sessionFonts = new Map<string, SessionFont>();
  const suppliedFonts = () => [...sessionFonts.values()].sort((a, b) => a.name.localeCompare(b.name));
  const renders = new Map<number, PsdRender>();
  // Detection renders by `renderKey`, until the next render request.
  const prepared = new Map<string, PsdRender>();
  let nextDocument = 0;
  let nextRender = 0;
  let queue = Promise.resolve();

  /** Queues a request; replies arrive through `post`, failures as `failed` replies. */
  function receive(request: PsdRequest) {
    const queued = performance.now();
    queue = queue
      .then(async () => {
        telemetry.enable(request.telemetry ?? false);
        telemetry.record('queue.wait', queued);
        const started = performance.now();
        await handle(request);
        telemetry.record(`request.${request.type}`, started);
      })
      .catch((error: unknown) => {
        post({ id: request.id, type: 'failed', error: { kind: 'invalid', message: String(error) } }, []);
      });
    return queue;
  }

  async function handle(request: PsdRequest) {
    if (request.type === 'open') {
      close();
      // Recovery opening decodes whole channels. Inspect only the fixed header before choosing that path.
      const header = new DataView(request.bytes);
      const large =
        header.byteLength >= 26 &&
        header.getUint32(0) === 0x38425053 &&
        requiresWindowedRendering({ width: header.getUint32(18), height: header.getUint32(14) });
      const loading = performance.now();
      await loadPsdViewer();
      telemetry.record('wasm.load', loading);
      telemetry.record('source.retained.bytes', performance.now(), request.bytes.byteLength);
      const opening = performance.now();
      const opened = large ? await openPsd(request.bytes) : await openPsdLikePhotoshop(request.bytes, request.answers);
      telemetry.record('open', opening);
      if (!opened.ok) {
        post({ id: request.id, type: 'failed', error: opened.error }, []);
        return;
      }

      document = { id: ++nextDocument, viewer: opened.value, inputBytes: request.bytes.byteLength };
      post(
        {
          id: request.id,
          type: 'opened',
          document: document.id,
          info: opened.value.info,
          layers: [...opened.value.layers],
          states: opened.value.states,
          opening: opened.value.opening
        },
        []
      );
      return;
    }

    if (request.type === 'addFonts') {
      const library = (fonts ??= await createFontLibrary());
      releasePrepared();
      const results = request.fonts.map((bytes, index) =>
        addFontFile(library, bytes, request.sources?.[index] ?? `font file ${request.id}:${index}`)
      );
      const rasterNames = new Set(library.fonts().map((font) => font.name));
      for (const result of results) {
        if (result.ok) {
          for (const face of result.value) {
            sessionFonts.set(face.name, {
              ...face,
              active: face.active || sessionFonts.get(face.name)?.active || false,
              raster: rasterNames.has(face.name)
            });
          }
        }
      }

      post({ id: request.id, type: 'fontsAdded', results, fonts: suppliedFonts() }, []);
      return;
    }

    if (request.type === 'listFonts') {
      post({ id: request.id, type: 'fonts', fonts: suppliedFonts() }, []);
      return;
    }

    if (request.type === 'close') {
      close();
      post({ id: request.id, type: 'closed' }, []);
      return;
    }

    if (!document || document.id !== request.document) {
      post({ id: request.id, type: 'failed', error: { kind: 'stale', message: 'the document was closed' } }, []);
      return;
    }

    const viewer = document.viewer;
    const windowed = requiresWindowedRendering(viewer.info);
    if (windowed && ['render', 'merged', 'difference', 'textSupport'].includes(request.type)) {
      post(
        failed(request, {
          kind: 'unsupported',
          message: 'This operation requires a whole-document composite; use the windowed layer view for this canvas.'
        }),
        []
      );
      return;
    }

    switch (request.type) {
      case 'renderWindow': {
        const start = performance.now();
        // Admission includes the host input in addition to WASM-owned document storage.
        const budget = { liveBytes: 2 * 1024 * 1024 * 1024, retainedBytes: document.inputBytes };
        const settings = { ...request.settings, maxWorkPixels: windowWorkPixels, budget };
        const window = request.window;
        const result =
          window.kind === 'regions'
            ? viewer.renderRegions(window.rectangles, settings, request.visibility, fonts)
            : window.kind === 'overview'
              ? viewer.renderOverview(window.step, settings, request.visibility, fonts)
              : viewer.savedOverview(window.step, windowWorkPixels, budget);
        if (!result.ok) {
          post(failed(request, result.error), []);
          return;
        }

        telemetry.record('tile.render', start);
        const images = Array.isArray(result.value) ? result.value : [result.value];
        post(
          { id: request.id, type: 'windowRendered', images, milliseconds: performance.now() - start },
          images.map((image) => image.pixels.buffer)
        );
        return;
      }
      case 'render': {
        const key = renderKey(request.settings, request.visibility);
        const reused = prepared.get(key);
        prepared.delete(key);
        releasePrepared();
        telemetry.record(reused ? 'render.reused' : 'render.new', performance.now(), 1);
        const rendered = reused
          ? { ok: true as const, value: reused }
          : composite(viewer, request.settings, request.visibility);
        if (!rendered.ok) {
          post({ id: request.id, type: 'failed', error: rendered.error }, []);
          return;
        }

        const id = ++nextRender;
        renders.set(id, rendered.value);
        for (const [old, render] of renders) {
          if (renders.size <= keptRenders) {
            break;
          }

          render.dispose();
          renders.delete(old);
        }

        // Keep every WASM report, including saved comp/frame selection and display-conversion approximations,
        // in the existing approximation list.
        const { width, height, depth, pixels, milliseconds, approximations } = rendered.value;
        post(
          {
            id: request.id,
            type: 'rendered',
            render: { render: id, width, height, depth, pixels, milliseconds, approximations }
          },
          [pixels.buffer]
        );
        return;
      }

      case 'merged': {
        const merged = viewer.merged();
        if (!merged.ok) {
          post({ id: request.id, type: 'failed', error: merged.error }, []);
          return;
        }

        post({ id: request.id, type: 'merged', image: merged.value }, [merged.value.pixels.buffer]);
        return;
      }

      case 'difference': {
        const render = renders.get(request.render);
        if (!render) {
          post(
            { id: request.id, type: 'failed', error: { kind: 'stale', message: 'newer renders replaced this one' } },
            []
          );
          return;
        }

        const difference = viewer.difference(render);
        if (!difference.ok) {
          post({ id: request.id, type: 'failed', error: difference.error }, []);
          return;
        }

        post({ id: request.id, type: 'difference', difference: difference.value }, [difference.value.pixels.buffer]);
        return;
      }

      case 'detectBlending': {
        releasePrepared();
        const detecting = performance.now();
        const detection = windowed
          ? { linearBlending: null, textGamma: null, differing: { encoded: null, linear: null, otherTextGamma: null } }
          : detectBlending(viewer, request.settings, request.visibility);
        telemetry.record('detection', detecting);
        post({ id: request.id, type: 'blending', detection }, []);
        return;
      }

      case 'documentFonts': {
        const report = viewer.fonts(fonts);
        if (report.ok) {
          for (const font of report.value.fonts) {
            font.available = sessionFonts.has(font.name) || font.available;
          }
        }
        post(
          report.ok ? { id: request.id, type: 'documentFonts', report: report.value } : failed(request, report.error),
          []
        );
        return;
      }

      case 'textSupport': {
        const support = viewer.textSupport(request.index, fonts);
        post(
          support.ok ? { id: request.id, type: 'textSupport', support: support.value } : failed(request, support.error),
          []
        );
        return;
      }

      case 'layer': {
        const detail = viewer.layerDetail(request.index);
        if (!detail.ok) {
          post({ id: request.id, type: 'failed', error: detail.error }, []);
          return;
        }

        // Adjustment and group records hold no pixels; their failure is part of the reply, not of the request.
        const bounds = detail.value.properties.bounds;
        const mask = detail.value.mask;
        const rectangles =
          mask && !('error' in mask) ? [bounds, mask.rect, ...(mask.real ? [mask.real.rect] : [])] : [bounds];
        const previewPixels = rectangles.reduce(
          (area, rect) => area + Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top),
          0
        );
        const pixels =
          windowed && (previewPixels > windowWorkPixels || (mask && 'error' in mask))
            ? {
                ok: false as const,
                error: { kind: 'unsupported' as const, message: 'This layer is too large for a whole-layer preview.' }
              }
            : viewer.layerPixels(request.index);
        const transfer = pixels.ok
          ? [pixels.value.pixels.buffer, ...pixels.value.masks.map((mask) => mask.values.buffer)]
          : [];
        post({ id: request.id, type: 'layer', detail: detail.value, pixels }, transfer);
        return;
      }
    }
  }

  /**
   * Renders the document with gamma blending off and on and compares each with the merged image, keeping the renders
   * in `prepared`. A document with type layers whose closer render still differs is rendered once more with "Blend Text
   * Colors Using Gamma" toggled, which Photoshop before CS6 did not offer. Settings the exact path refuses are tried
   * again with `approximate`, whose renders of what the exact path does render are identical.
   */
  function detectBlending(
    viewer: PsdViewerDocument,
    settings: PsdRenderSettings,
    visibility: [number, boolean][]
  ): BlendingDetection {
    const undecided = { encoded: null, linear: null, otherTextGamma: null };
    if (!viewer.info.mergedImage) {
      return { linearBlending: null, textGamma: null, differing: undecided };
    }

    let approximate = settings.approximate;
    const differing = (patch: Partial<PsdRenderSettings>) => {
      const tried = { ...settings, ...patch, approximate };
      const rendered = composite(viewer, tried, visibility);
      if (!rendered.ok) {
        return null;
      }

      prepared.set(renderKey(tried, visibility), rendered.value);
      const difference = viewer.difference(rendered.value);
      return difference.ok ? difference.value.differingSamples : null;
    };
    let encoded = differing({ linearBlending: false });
    let linear = differing({ linearBlending: true });
    if (encoded === null && linear === null && !approximate) {
      approximate = true;
      encoded = differing({ linearBlending: false });
      linear = differing({ linearBlending: true });
    }

    const linearBlending = closer(encoded, linear);
    const chosen = linearBlending ?? settings.linearBlending;
    const best = chosen ? linear : encoded;
    if (!best || !hasTypeLayers(viewer.layers)) {
      return { linearBlending, textGamma: null, differing: { encoded, linear, otherTextGamma: null } };
    }

    const otherTextGamma = differing({ linearBlending: chosen, textGamma: settings.textGamma === null ? 1.45 : null });
    const toggled = closer(best, otherTextGamma);
    const textGamma = toggled === null ? null : toggled === (settings.textGamma === null);
    return { linearBlending, textGamma, differing: { encoded, linear, otherTextGamma } };
  }

  function composite(viewer: PsdViewerDocument, settings: PsdRenderSettings, visibility: [number, boolean][]) {
    const start = performance.now();
    const result = viewer.render(settings, visibility, fonts);
    telemetry.record('composite', start, 1);
    if (result.ok) {
      telemetry.record('render.rgba.bytes', performance.now(), result.value.pixels.byteLength);
    }

    return result;
  }

  function releasePrepared() {
    for (const render of prepared.values()) {
      render.dispose();
    }

    prepared.clear();
  }

  function close() {
    releasePrepared();
    renders.clear();
    document?.viewer.close();
    document = undefined;
  }

  return { receive };
}

/** The failed reply to `request`. */
function failed(request: PsdRequest, error: PsdFailure): PsdReply {
  return { id: request.id, type: 'failed', error };
}

/** Identifies a render request by its settings and visibility overrides, whatever the order of the settings' fields. */
function renderKey(settings: PsdRenderSettings, visibility: [number, boolean][]): string {
  const { grayProfile, ...scalarSettings } = settings;
  // The key list also filters nested objects, so it names the keys of a saved state too.
  // Keep profile bytes in an array: the scalar-key whitelist would erase a Uint8Array's numeric keys.
  return JSON.stringify(
    [scalarSettings, visibility, grayProfile ? Array.from(grayProfile) : null],
    [...Object.keys(scalarSettings), 'frame', 'comp'].sort()
  );
}

/** Whether the second of two differing-sample counts is smaller: `null` when either is missing or they are equal. */
function closer(first: number | null, second: number | null): boolean | null {
  return first === null || second === null || first === second ? null : second < first;
}

/** Whether a layer tree holds a type layer. */
function hasTypeLayers(layers: readonly PsdLayerNode[]): boolean {
  return layers.some((layer) => layer.kind === 'text' || hasTypeLayers(layer.children ?? []));
}

/** Renders whose full-depth composites stay available for comparisons. */
const keptRenders = 2;
