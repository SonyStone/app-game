import {
  createFontLibrary,
  openPsdLikePhotoshop,
  type PsdFailure,
  type PsdFontLibrary,
  type PsdLayerNode,
  type PsdRender,
  type PsdRenderSettings,
  type PsdViewerDocument
} from '@app-game/psd/viewer';
import type { BlendingDetection, PsdReply, PsdRequest } from './protocol';

/**
 * The worker side of the protocol, independent of the worker global so tests can drive it directly. It holds one open
 * document and the full-depth composites of its two latest renders, so the UI can still compare the render it shows
 * while the next one is already running; opening another document closes the previous one, even when the new one
 * fails or waits for an answer to a Photoshop prompt. Documents open as Photoshop opens them (`openPsdLikePhotoshop`).
 * The renders a blending
 * detection made wait for the next render request, which takes the one with its settings and visibility instead of
 * compositing again; the others are freed then. It also holds the font library, created on first use and kept across
 * documents, which renders with `typeLayers` use. Requests run one at a time in arrival order. `post` sends a reply with the buffers to transfer.
 */
export function makePsdWorkerHost(post: (reply: PsdReply, transfer: Transferable[]) => void) {
  let document: { id: number; viewer: PsdViewerDocument } | undefined;
  let fonts: PsdFontLibrary | undefined;
  const renders = new Map<number, PsdRender>();
  // Detection renders by `renderKey`, until the next render request.
  const prepared = new Map<string, PsdRender>();
  let nextDocument = 0;
  let nextRender = 0;
  let queue = Promise.resolve();

  /** Queues a request; replies arrive through `post`, failures as `failed` replies. */
  function receive(request: PsdRequest) {
    queue = queue
      .then(() => handle(request))
      .catch((error: unknown) => {
        post({ id: request.id, type: 'failed', error: { kind: 'invalid', message: String(error) } }, []);
      });
    return queue;
  }

  async function handle(request: PsdRequest) {
    if (request.type === 'open') {
      close();
      const opened = await openPsdLikePhotoshop(request.bytes, request.answers);
      if (!opened.ok) {
        post({ id: request.id, type: 'failed', error: opened.error }, []);
        return;
      }

      document = { id: ++nextDocument, viewer: opened.value };
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
      const results = request.fonts.map((bytes) => library.add(bytes));
      post({ id: request.id, type: 'fontsAdded', results, fonts: library.fonts() }, []);
      return;
    }

    if (request.type === 'listFonts') {
      post({ id: request.id, type: 'fonts', fonts: fonts?.fonts() ?? [] }, []);
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
    switch (request.type) {
      case 'render': {
        const key = renderKey(request.settings, request.visibility);
        const reused = prepared.get(key);
        prepared.delete(key);
        releasePrepared();
        const rendered = reused
          ? { ok: true as const, value: reused }
          : viewer.render(request.settings, request.visibility, fonts);
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
        const detection = detectBlending(viewer, request.settings, request.visibility);
        post({ id: request.id, type: 'blending', detection }, []);
        return;
      }

      case 'documentFonts': {
        const report = viewer.fonts(fonts);
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
        const pixels = viewer.layerPixels(request.index);
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
      const rendered = viewer.render(tried, visibility, fonts);
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
  // The key list also filters nested objects, so it names the keys of a saved state too.
  return JSON.stringify([settings, visibility], [...Object.keys(settings), 'frame', 'comp'].sort());
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
