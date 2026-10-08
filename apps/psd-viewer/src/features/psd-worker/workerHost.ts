import {
  createFontLibrary,
  openPsd,
  type PsdFailure,
  type PsdFontLibrary,
  type PsdRender,
  type PsdViewerDocument
} from '@app-game/psd/viewer';
import type { PsdReply, PsdRequest } from './protocol';

/**
 * The worker side of the protocol, independent of the worker global so tests can drive it directly. It holds one open
 * document and the full-depth composites of its two latest renders, so the UI can still compare the render it shows
 * while the next one is already running; opening another document closes the previous one. It also holds the font
 * library, created on first use and kept across documents, which renders with `typeLayers` use. Requests run one at a
 * time in arrival order. `post` sends a reply with the buffers to transfer.
 */
export function makePsdWorkerHost(post: (reply: PsdReply, transfer: Transferable[]) => void) {
  let document: { id: number; viewer: PsdViewerDocument } | undefined;
  let fonts: PsdFontLibrary | undefined;
  const renders = new Map<number, PsdRender>();
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
      const opened = await openPsd(request.bytes);
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
          layers: [...opened.value.layers]
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
        const rendered = viewer.render(request.settings, request.visibility, fonts);
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

  function close() {
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

/** Renders whose full-depth composites stay available for comparisons. */
const keptRenders = 2;
