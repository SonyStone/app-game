import { loadPsd } from '@app-game/psd';
import {
  createFontLibrary,
  loadPsdViewer,
  openPsd,
  openPsdLikePhotoshop,
  openPsdSource,
  photoshopDefaultSettings,
  type PsdFailure,
  type PsdFontLibrary,
  type PsdInfo,
  type PsdLayerDetail,
  type PsdLayerNode,
  type PsdLayerPixels,
  type PsdNativeRenderOptions,
  type PsdRegionRect,
  type PsdRender,
  type PsdRenderSettings,
  type PsdSavedProcessChannels,
  type PsdViewerDocument,
  type PsdViewerSource
} from '@app-game/psd/viewer';
import { makeEditingSession } from '../editing/makeEditingSession';
import { addFontFile, type SessionFont } from '../fonts/addFontFile';
import { makePerformanceRecorder } from '../telemetry/performance';
import { inspectionRect, wireDisplay, wireSample } from './nativePixels';
import {
  requiresWindowedRendering,
  windowWorkPixels,
  type BlendingDetection,
  type PsdReply,
  type PsdRequest
} from './protocol';
import { regionMips } from './regionMips';
import { preferWholeRender } from './windowCost';

/**
 * The worker side of the protocol, independent of the worker global so tests can drive it directly. It holds one open
 * document and the full-depth composites of its two latest renders, so the UI can still compare the render it shows
 * while the next one is already running; opening another document closes the previous one, even when the new one
 * fails or waits for an answer to a Photoshop prompt. Small documents open as Photoshop opens them; large canvases
 * use the strict, lazy reader because recovery still decodes whole channels. Large-canvas requests never run
 * whole-document compositing, comparison or blending detection. Small documents compare repeated source work
 * against one whole composite; tile cuts retain one display buffer for the current settings/visibility key.
 * Window calls admit up to 2 GiB live and count the retained host input; typed budget refusals travel to the UI as ordinary failed replies.
 * The renders a blending
 * detection made wait for the next render request, which takes the one with its settings and visibility instead of
 * compositing again; the others are freed then. It also holds the font library, created on first use and kept across
 * documents, for imported cache mixing and optional rerasterization. Adding fonts releases prepared renders. Requests
 * run one at a time in arrival order. `post` sends a reply with the buffers to transfer.
 */
export function makePsdWorkerHost(send: (reply: PsdReply, transfer: Transferable[]) => void) {
  const telemetry = makePerformanceRecorder();
  let wasmMemory: WebAssembly.Memory | undefined;
  let editorMemory: WebAssembly.Memory | undefined;
  let editorSourceBytes = 0;
  const wasmBytes = () => (wasmMemory?.buffer.byteLength ?? 0) + (editorMemory?.buffer.byteLength ?? 0);
  let requestStart = 0;
  let requestName = '';
  function post(reply: PsdReply, transfer: Transferable[]) {
    telemetry.record(`request.${requestName}`, requestStart);
    telemetry.record(
      'transfer.bytes',
      performance.now(),
      transfer.reduce<number>((sum, value) => sum + (value instanceof ArrayBuffer ? value.byteLength : 0), 0)
    );
    telemetry.record('wasm.linear.bytes', performance.now(), wasmBytes());
    telemetry.record('transfer.postedAt', performance.now(), performance.timeOrigin + performance.now());
    send(
      {
        ...reply,
        memory: { wasmBytes: wasmBytes(), sourceBytes: (document?.inputBytes ?? 0) + editorSourceBytes },
        performance: telemetry.take()
      },
      transfer
    );
  }

  let document:
    | {
        id: number;
        viewer?: PsdViewerDocument;
        source?: PsdViewerSource;
        inputBytes: number;
        original: ArrayBuffer | Blob;
        info: PsdInfo;
        sourceLayers?: import('@app-game/psd/viewer').PsdSourceLayer[];
        windowed: boolean;
      }
    | undefined;
  let editing: Awaited<ReturnType<typeof makeEditingSession>> | undefined;
  let fonts: PsdFontLibrary | undefined;
  const sessionFonts = new Map<string, SessionFont>();
  const suppliedFonts = () => [...sessionFonts.values()].sort((a, b) => a.name.localeCompare(b.name));
  const renders = new Map<number, PsdRender>();
  // Detection renders by `renderKey`, until the next render request.
  const prepared = new Map<string, PsdRender>();
  // Keep one display composite for whole-render tile cuts. It owns host bytes, never transferred directly.
  let wholeCache: { key: string; image: Omit<PsdRender, 'dispose'> } | undefined;
  const wholeCosts = new Map<string, number>();
  const windowCosts = new Map<string, number>();
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
        requestStart = performance.now();
        requestName = request.type;
        await handle(request);
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
      const blob = request.bytes instanceof Blob ? request.bytes : undefined;
      const reader = blob ? new FileReaderSync() : undefined;
      const header = new DataView(blob ? reader!.readAsArrayBuffer(blob.slice(0, 26)) : (request.bytes as ArrayBuffer));
      const large =
        header.byteLength >= 26 &&
        header.getUint32(0) === 0x38425053 &&
        requiresWindowedRendering({ width: header.getUint32(18), height: header.getUint32(14) });
      const loading = performance.now();
      const codec = await loadPsdViewer();
      wasmMemory = (await codec.default()).memory;
      telemetry.record('wasm.load', loading);
      if (
        blob &&
        (request.mode === 'source' ||
          ((blob.size > 128 * 1024 ** 2 || (header.getUint16(4) === 2 && blob.size > 64 * 1024 ** 2)) &&
            request.mode !== 'strict'))
      ) {
        const blocks = new Map<number, Uint8Array>();
        const result = await openPsdSource((offset, length) => {
          if (offset > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('Blob offset exceeds safe host addressing');
          }
          const position = Number(offset);
          if (length <= 64) {
            // RLE row tables contain thousands of tiny words. Cache at most eight 8 KiB host slices.
            const base = Math.floor(position / 8192) * 8192;
            let bytes = blocks.get(base);
            if (!bytes) {
              bytes = new Uint8Array(reader!.readAsArrayBuffer(blob.slice(base, base + 8192 + 64)));
              telemetry.record('source.read.max', performance.now(), bytes.length);
              blocks.set(base, bytes);
              if (blocks.size > 8) {
                blocks.delete(blocks.keys().next().value!);
              }
            }
            return bytes.subarray(position - base, position - base + length);
          }
          telemetry.record('source.read.max', performance.now(), length);
          return new Uint8Array(reader!.readAsArrayBuffer(blob.slice(position, position + length)));
        }, BigInt(blob.size));
        if (!result.ok) {
          post(failed(request, result.error), []);
          return;
        }

        const source = result.value;
        const indexed = source.layerInfo();
        const sourceLayers = indexed.ok ? indexed.value : [];
        const info = sourceInfo(source, header.getUint16(4) === 2, sourceLayers.length);
        document = { id: ++nextDocument, source, info, sourceLayers, inputBytes: 0, original: blob, windowed: true };
        post(
          {
            id: request.id,
            type: 'opened',
            document: document.id,
            info,
            layers: sourceLayers.map(sourceNode),
            states: { comps: [], frames: [], errors: [], lastAppliedComp: null, activeFrame: null },
            opening: { reader: 'strict', alerts: [], repairs: [] },
            windowed: true,
            sourceBacked: true,
            sourceLayerFailure: indexed.ok ? undefined : indexed.error
          },
          []
        );
        return;
      }

      const bytes = blob ? reader!.readAsArrayBuffer(blob) : (request.bytes as ArrayBuffer);
      telemetry.record('source.retained.bytes', performance.now(), bytes.byteLength);
      const opening = performance.now();
      const opened =
        large || request.mode === 'strict' ? await openPsd(bytes) : await openPsdLikePhotoshop(bytes, request.answers);
      telemetry.record('open', opening);
      if (!opened.ok) {
        post({ id: request.id, type: 'failed', error: opened.error }, []);
        return;
      }

      document = {
        id: ++nextDocument,
        viewer: opened.value,
        inputBytes: bytes.byteLength,
        original: blob ?? bytes,
        info: opened.value.info,
        windowed: large
      };
      // Optional small-canvas planning follows saved first pixels through the capability request.
      const capability = large ? planFor(opened.value, photoshopDefaultSettings, []) : undefined;
      post(
        {
          id: request.id,
          type: 'opened',
          document: document.id,
          info: opened.value.info,
          layers: [...opened.value.layers],
          states: opened.value.states,
          opening: opened.value.opening,
          windowed: document.windowed,
          capability
        },
        []
      );
      return;
    }

    if (request.type === 'addFonts') {
      const library = (fonts ??= await createFontLibrary());
      releasePrepared();
      wholeCache = undefined;
      wholeCosts.clear();
      windowCosts.clear();
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

    if (request.type === 'editor') {
      if (!editing && request.request.kind === 'open') {
        const size = document.original instanceof Blob ? document.original.size : document.original.byteLength;
        // Two editor parses, renderer, replay and prepared bytes must coexist. Do not weaken huge-file opening.
        if (document.source || size > 64 * 1024 ** 2) {
          post(
            {
              id: request.id,
              type: 'editor',
              result: {
                ok: false,
                error: {
                  code: 'ResourceBudget',
                  message:
                    'Editing requires an eager source of at most 64 MiB. Source-backed viewing and original download remain available.',
                  resource: 'editor.sourceBytes',
                  requested: BigInt(size),
                  limit: 64n * 1024n ** 2n
                }
              }
            },
            []
          );
          return;
        }
        const bytes =
          document.original instanceof Blob
            ? new Uint8Array(await document.original.arrayBuffer())
            : new Uint8Array(document.original);
        editorSourceBytes = document.original instanceof Blob ? bytes.byteLength : 0;
        const codec = await loadPsd();
        editorMemory = (await codec.default()).memory;
        editing = await makeEditingSession(bytes, async (updated) => {
          const reopened = await openPsd(updated);
          if (!reopened.ok) {
            return {
              ok: false,
              error: {
                code: 'RenderRequired',
                message: `Edited source could not reopen strictly: ${reopened.error.message}`
              }
            };
          }
          // Admitted metadata operations preserve all encoded pixel/cache operands. Keep content identity,
          // resident GPU/tile products and original bytes, while future inspection uses the edited source.
          document!.viewer!.close();
          document!.viewer = reopened.value;
          document!.info = reopened.value.info;
          return { ok: true, value: undefined };
        });
      }
      const result = editing?.ok
        ? await editing.value.receive(request.request)
        : (editing ?? { ok: false as const, error: { code: 'Disposed' as const, message: 'Enter Edit mode first.' } });
      const transfer =
        result.ok && result.value.kind === 'chunk' && result.value.bytes
          ? [result.value.bytes.buffer as ArrayBuffer]
          : [];
      post({ id: request.id, type: 'editor', result }, transfer);
      return;
    }

    if (document.source) {
      handleSource(request as Exclude<PsdRequest, { type: 'open' | 'close' | 'addFonts' | 'listFonts' | 'editor' }>);
      return;
    }

    const viewer = document.viewer!;
    const readBudget = {
      liveBytes: 2 * 1024 ** 3,
      retainedBytes: document.inputBytes + editorSourceBytes + (editorMemory?.buffer.byteLength ?? 0)
    };
    const windowed = document.windowed;
    if (
      (windowed && ['render', 'difference', 'textSupport'].includes(request.type)) ||
      (requiresWindowedRendering({ width: viewer.info.width, height: viewer.info.height }) && request.type === 'merged')
    ) {
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
      case 'capability': {
        const result = planFor(viewer, request.settings, request.visibility);
        if (!result.ok) {
          post(failed(request, result.error), []);
          return;
        }

        document.windowed = chooseWindowed(viewer, request.settings, request.visibility, result);
        post({ id: request.id, type: 'capability', capability: result.value, windowed: document.windowed }, []);
        return;
      }
      case 'inspect': {
        const saved = viewer.savedRegion(request.rect, savedIds(viewer.info), readBudget);
        const current = viewer.renderNativeRegion(
          request.rect,
          nativeOptions(request.settings, request.visibility),
          fonts
        );
        post({ id: request.id, type: 'inspect', saved, current }, [
          ...(saved.ok ? saved.value.planes.map((plane) => plane.bytes.buffer) : []),
          ...(current.ok ? [current.value.samples.buffer] : [])
        ]);
        return;
      }
      case 'renderWindow': {
        const start = performance.now();
        const window = request.window;
        if (window.kind === 'overview' && (!Number.isSafeInteger(window.step) || window.step < 1)) {
          post(failed(request, { kind: 'invalid', message: 'Overview step must be a positive integer.' }), []);
          return;
        }

        if (window.kind !== 'saved' && !document.windowed && request.liveBytes === undefined) {
          const key = renderKey(request.settings, request.visibility);
          if (wholeCache?.key !== key) {
            const rendered = composite(viewer, request.settings, request.visibility);
            if (!rendered.ok) {
              post(failed(request, rendered.error), []);
              return;
            }

            const { dispose, ...image } = rendered.value;
            wholeCache = { key, image };
            dispose();
          }

          const image = wholeCache.image;
          const rectangles =
            window.kind === 'regions'
              ? window.rectangles
              : [{ left: 0, top: 0, width: image.width, height: image.height }];
          if (
            rectangles.some(
              (rect) =>
                ![rect.left, rect.top, rect.width, rect.height].every(Number.isSafeInteger) ||
                rect.left < 0 ||
                rect.top < 0 ||
                rect.width <= 0 ||
                rect.height <= 0 ||
                rect.left + rect.width > image.width ||
                rect.top + rect.height > image.height
            )
          ) {
            post(failed(request, { kind: 'invalid', message: 'Region must lie within the document canvas.' }), []);
            return;
          }

          const outputPixels = rectangles.reduce(
            (sum, rect) =>
              sum +
              Math.ceil(rect.width / (window.kind === 'overview' ? window.step : 1)) *
                Math.ceil(rect.height / (window.kind === 'overview' ? window.step : 1)),
            0
          );
          if (outputPixels > windowWorkPixels) {
            post(
              failed(request, {
                kind: 'budget',
                resource: 'output pixels',
                requested: BigInt(outputPixels),
                limit: BigInt(windowWorkPixels),
                message: 'Window output exceeds the pixel budget.'
              }),
              []
            );
            return;
          }

          const images = rectangles.map((rect) => {
            const step = window.kind === 'overview' ? window.step : 1;
            const width = Math.ceil(rect.width / step);
            const height = Math.ceil(rect.height / step);
            const pixels = new Uint8Array(width * height * 4);
            for (let y = 0; y < height; y++) {
              if (step === 1) {
                const offset = ((rect.top + y) * image.width + rect.left) * 4;
                pixels.set(image.pixels.subarray(offset, offset + width * 4), y * width * 4);
              } else {
                for (let x = 0; x < width; x++) {
                  const offset = ((rect.top + y * step) * image.width + rect.left + x * step) * 4;
                  pixels.set(image.pixels.subarray(offset, offset + 4), (y * width + x) * 4);
                }
              }
            }

            const cut = {
              ...rect,
              width,
              height,
              step,
              pixels,
              source: 'layers' as const,
              strategy: 'fullCanvas' as const,
              exactToLayerRender: step === 1,
              approximations: image.approximations
            };
            return {
              ...cut,
              populated: hasVisiblePixels(pixels),
              ...(window.kind === 'regions' && window.mipStep ? { mips: regionMips(cut, window.mipStep) } : {})
            };
          });
          telemetry.record('tile.wholeCut', start);
          post(
            { id: request.id, type: 'windowRendered', images, milliseconds: performance.now() - start },
            images.flatMap((image) => [image.pixels.buffer, ...(image.mips ?? []).map((mip) => mip.pixels.buffer)])
          );
          return;
        }

        // A storage plan chooses the caller's live budget. Fonts and the retained host source stay accounted.
        let liveBytes = request.liveBytes ?? 512 * 1024 ** 2;
        if (window.kind === 'regions') {
          for (const rect of window.rectangles) {
            const plan = viewer.regionCapability(rect, nativeOptions(request.settings, request.visibility), fonts);
            if (!plan.ok || plan.value.refusal) {
              post(failed(request, plan.ok ? plan.value.refusal! : plan.error), []);
              return;
            }
            const required = Math.ceil(Number(plan.value.liveBytes) / (64 * 1024 ** 2)) * 64 * 1024 ** 2;
            if (request.liveBytes === undefined) {
              liveBytes = Math.max(liveBytes, required);
            }
            telemetry.record('region.live.required.bytes', performance.now(), Number(plan.value.liveBytes));
          }
        } else {
          liveBytes = request.liveBytes ?? 2 * 1024 ** 3;
        }
        telemetry.record('region.live.budget.bytes', performance.now(), liveBytes);
        const budget = {
          liveBytes,
          retainedBytes: document.inputBytes + editorSourceBytes + (editorMemory?.buffer.byteLength ?? 0)
        };
        const settings = { ...request.settings, maxWorkPixels: windowWorkPixels, budget };
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

        if (window.kind === 'regions' && window.rectangles.length) {
          if (windowCosts.size >= 16) {
            windowCosts.delete(windowCosts.keys().next().value!);
          }
          windowCosts.set(
            renderKey(request.settings, request.visibility),
            (performance.now() - start) / window.rectangles.length
          );
        }
        telemetry.record('tile.render', start);
        const images = (Array.isArray(result.value) ? result.value : [result.value]).map((image) => ({
          ...image,
          populated: hasVisiblePixels(image.pixels),
          ...(window.kind === 'regions' && window.mipStep ? { mips: regionMips(image, window.mipStep) } : {})
        }));
        post(
          { id: request.id, type: 'windowRendered', images, milliseconds: performance.now() - start },
          images.flatMap((image) => [image.pixels.buffer, ...(image.mips ?? []).map((mip) => mip.pixels.buffer)])
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

        // A transferred render detaches its display buffer. Retain an independent cut source only on demand.
        wholeCache = undefined;
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

      case 'original': {
        post(
          {
            id: request.id,
            type: 'original',
            bytes: new Blob([document.original], { type: 'application/octet-stream' })
          },
          []
        );
        return;
      }

      case 'channels': {
        const rect = request.rect ?? inspectionRect(viewer.info);
        const result = viewer.savedRegion(
          rect,
          Uint16Array.from({ length: viewer.info.channels }, (_, i) => i),
          readBudget
        );
        const channels = result.ok ? { ok: true as const, value: channelPreview(result.value, rect) } : result;
        post(
          channels.ok
            ? { id: request.id, type: 'channels', channels: channels.value }
            : failed(request, channels.error),
          channels.ok ? channels.value.planes.map((plane) => plane.bytes.buffer) : []
        );
        return;
      }

      case 'paths': {
        const result = viewer.savedPaths();
        post(result.ok ? { id: request.id, type: 'paths', paths: result.value } : failed(request, result.error), []);
        return;
      }

      case 'gpuLayers': {
        const hasText = (nodes: readonly PsdLayerNode[]): boolean =>
          nodes.some((node) => node.kind === 'text' || hasText(node.children ?? []));
        if (fonts && hasText(viewer.layers)) {
          post(
            failed(request, { kind: 'unsupported', message: 'Supplied-font text mixing requires the strict worker.' }),
            []
          );
          return;
        }
        const { prepareGpuLayers } = await import('@app-game/psd/gpu');
        const result = prepareGpuLayers(viewer, request.rect, request.settings, document.inputBytes);
        post(
          result.ok ? { id: request.id, type: 'gpuLayers', source: result.value } : failed(request, result.error),
          result.ok ? result.value.layers.map((layer) => layer.samples.buffer) : []
        );
        return;
      }

      case 'layer': {
        const detail = viewer.layerDetail(request.index);
        if (!detail.ok) {
          post({ id: request.id, type: 'failed', error: detail.error }, []);
          return;
        }

        const rect = request.rect ?? layerPreviewRect(detail.value, viewer.info);
        const ids = Int16Array.from(detail.value.properties.channels);
        const region = viewer.layerRegion(request.index, rect, ids, readBudget);
        const pixels = region.ok ? layerPreview(region.value, rect, detail.value) : region;
        const transfer = pixels.ok
          ? [pixels.value.pixels.buffer, ...pixels.value.masks.map((mask) => mask.values.buffer)]
          : [];
        post({ id: request.id, type: 'layer', detail: detail.value, pixels }, transfer);
        return;
      }
    }
  }

  /** Preflight retains host source accounting and explicitly opts into the backend's larger text budget. */
  function nativeOptions(
    settings: import('@app-game/psd/viewer').PsdRenderSettings,
    visibility: [number, boolean][]
  ): PsdNativeRenderOptions {
    const { grayProfile, smartObjects, availableFonts, ...rest } = settings;
    return {
      ...rest,
      grayProfile: grayProfile ?? undefined,
      smartObjects: smartObjects ?? undefined,
      availableFonts: availableFonts ? [...availableFonts] : undefined,
      visibility,
      maxWorkPixels: windowWorkPixels,
      budget: {
        liveBytes: 2 * 1024 ** 3,
        retainedBytes: (document?.inputBytes ?? 0) + editorSourceBytes + (editorMemory?.buffer.byteLength ?? 0)
      }
    };
  }

  function planFor(viewer: PsdViewerDocument, settings: PsdRenderSettings, visibility: [number, boolean][]) {
    return viewer.regionCapability(
      { left: 0, top: 0, width: Math.min(544, viewer.info.width), height: Math.min(544, viewer.info.height) },
      nativeOptions(settings, visibility),
      fonts
    );
  }

  /** Large canvases always stay bounded. Small canvases pay shared dependency work only once. */
  function chooseWindowed(
    viewer: PsdViewerDocument,
    settings: PsdRenderSettings,
    visibility: [number, boolean][],
    region: ReturnType<typeof planFor>
  ) {
    const { width, height } = viewer.info;
    if (requiresWindowedRendering({ width, height })) {
      return true;
    }

    if (!region.ok || region.value.strategy !== 'window' || width * height < 1_048_576) {
      return false;
    }

    const whole = viewer.regionCapability(
      { left: 0, top: 0, width, height },
      nativeOptions(settings, visibility),
      fonts
    );
    if (!whole.ok) {
      return false;
    }

    const key = renderKey(settings, visibility);
    const wholeMilliseconds = wholeCosts.get(key);
    const windowMilliseconds = windowCosts.get(key);
    return !preferWholeRender(
      viewer.info,
      region.value,
      whole.value,
      wholeMilliseconds !== undefined && windowMilliseconds !== undefined
        ? { wholeMilliseconds, windowMilliseconds }
        : undefined
    );
  }

  /** Source sessions never silently compose layers or claim saved pixels reflect visibility/settings. */
  function handleSource(
    request: Exclude<PsdRequest, { type: 'open' | 'close' | 'addFonts' | 'listFonts' | 'editor' }>
  ) {
    const source = document!.source!;
    const info = document!.info;
    if (request.type === 'original') {
      post({ id: request.id, type: 'original', bytes: new Blob([document!.original]) }, []);
      return;
    }

    if (request.type === 'inspect') {
      const saved = source.savedRegion(request.rect, savedIds(info));
      post(
        { id: request.id, type: 'inspect', saved, current: sourceUnsupported() },
        saved.ok ? saved.value.planes.map((plane) => plane.bytes.buffer) : []
      );
      return;
    }

    if (request.type === 'channels') {
      const rect = request.rect ?? inspectionRect(info);
      const result = source.savedRegion(
        rect,
        Uint16Array.from({ length: info.channels }, (_, i) => i)
      );
      post(
        result.ok
          ? { id: request.id, type: 'channels', channels: channelPreview(result.value, rect) }
          : failed(request, result.error),
        result.ok ? result.value.planes.map((plane) => plane.bytes.buffer) : []
      );
      return;
    }

    if (request.type === 'layer') {
      const layer = document!.sourceLayers?.find((layer) => layer.index === request.index);
      if (!layer) {
        post(failed(request, { kind: 'unsupported', message: 'This source layer carrier cannot be indexed.' }), []);
        return;
      }
      const detail = sourceDetail(layer);
      const rect = request.rect ?? layerPreviewRect(detail, info);
      const region = source.layerRegion(
        layer.index,
        rect,
        Int16Array.from(layer.channels.map((channel) => channel.id))
      );
      const pixels = region.ok ? layerPreview(region.value, rect, detail) : region;
      post(
        { id: request.id, type: 'layer', detail, pixels },
        pixels.ok ? [pixels.value.pixels.buffer, ...pixels.value.masks.map((mask) => mask.values.buffer)] : []
      );
      return;
    }

    if (request.type === 'documentFonts') {
      post({ id: request.id, type: 'documentFonts', report: { layers: [], fonts: [], releaseMismatches: [] } }, []);
      return;
    }

    if (request.type === 'renderWindow') {
      if (![0, 1, 3].includes(info.mode)) {
        post(
          failed(request, {
            kind: 'unsupported',
            message: `Source-backed display conversion for mode ${info.mode} is unavailable. Native saved planes remain inspectable.`
          }),
          []
        );
        return;
      }

      const start = performance.now();
      const window = request.window;
      const images: import('./protocol').WindowPixels[] = [];
      if (window.kind === 'regions') {
        for (const rect of window.rectangles) {
          const result = source.savedRegion(rect, savedIds(info));
          if (!result.ok) {
            post(failed(request, result.error), []);
            return;
          }
          const image = wireDisplay(result.value, rect);
          images.push({
            ...image,
            populated: hasVisiblePixels(image.pixels),
            ...(window.mipStep ? { mips: regionMips(image, window.mipStep) } : {})
          });
        }
      } else {
        const step = window.step;
        const width = Math.ceil(info.width / step);
        const height = Math.ceil(info.height / step);
        const result = source.savedOverview(step, savedIds(info));
        if (!result.ok) {
          post(failed(request, result.error), []);
          return;
        }
        const pixels = wireDisplay(result.value, { left: 0, top: 0, width, height }).pixels;
        images.push({
          left: 0,
          top: 0,
          width,
          height,
          step,
          pixels,
          source: 'savedComposite',
          strategy: 'window',
          exactToLayerRender: false,
          approximations: ['Source-backed saved composite may be stale; original matte retained.']
        });
      }
      post(
        { id: request.id, type: 'windowRendered', images, milliseconds: performance.now() - start },
        images.flatMap((image) => [image.pixels.buffer, ...(image.mips ?? []).map((mip) => mip.pixels.buffer)])
      );
      return;
    }

    post(failed(request, sourceUnsupported().error), []);
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
    if (wholeCosts.size >= 16) {
      wholeCosts.delete(wholeCosts.keys().next().value!);
    }
    wholeCosts.set(renderKey(settings, visibility), performance.now() - start);
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
    if (editing?.ok) {
      editing.value.dispose();
    }
    editing = undefined;
    editorSourceBytes = 0;
    wholeCache = undefined;
    wholeCosts.clear();
    windowCosts.clear();
    releasePrepared();
    renders.clear();
    document?.viewer?.close();
    document?.source?.close();
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
  const normalized = {
    linearBlending: settings.linearBlending ?? photoshopDefaultSettings.linearBlending,
    textGamma: settings.textGamma === undefined ? photoshopDefaultSettings.textGamma : settings.textGamma,
    vectorPaths: settings.vectorPaths ?? photoshopDefaultSettings.vectorPaths,
    smartObjects: settings.smartObjects ?? null,
    approximate: settings.approximate ?? photoshopDefaultSettings.approximate,
    typeLayers: settings.typeLayers ?? photoshopDefaultSettings.typeLayers,
    state: settings.state ?? null,
    availableFonts: settings.availableFonts ? [...new Set(settings.availableFonts)].sort() : null,
    grayProfile: settings.grayProfile ? Array.from(settings.grayProfile) : null
  };
  // The compositor applies the last override for a layer; order across different layers is immaterial.
  const overrides = [...new Map(visibility)].sort(([left], [right]) => left - right);
  return JSON.stringify([normalized, overrides]);
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

/** Empty windows must not calibrate the populated-tile throughput admission gate. */
function hasVisiblePixels(pixels: Uint8Array) {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) {
      return true;
    }
  }

  return false;
}

/** Saved color planes plus alpha only when known; extra auxiliary plates are loaded separately by the channel panel. */
function savedIds(info: Pick<PsdInfo, 'mode' | 'channels' | 'mergedImage'>) {
  const colors = info.mode === 3 || info.mode === 9 ? 3 : info.mode === 4 ? 4 : 1;
  return Uint16Array.from({ length: Math.min(info.channels, colors + (info.mergedImage?.alpha ? 1 : 0)) }, (_, i) => i);
}

function sourceUnsupported() {
  return {
    ok: false as const,
    error: {
      kind: 'unsupported' as const,
      message:
        'Source-backed view reads potentially stale saved pixels. Current layer composition and document-wide metadata require the eager reader.'
    }
  };
}

function sourceInfo(source: PsdViewerSource, psb: boolean, layers: number): PsdInfo {
  const info = source.info;
  return {
    ...info,
    psb,
    modeName:
      ({ 0: 'Bitmap', 1: 'Grayscale', 3: 'RGB', 4: 'CMYK', 9: 'Lab' } as Record<number, string>)[info.mode] ??
      `Mode ${info.mode}`,
    colorModeDataSize: Number(info.colorMode.length),
    resources: [],
    resourcesTailSize: 0,
    blocks: [],
    layerSource: 'source-backed primary records',
    layerRecords: layers,
    groups: 0,
    globalMaskSize: 0,
    mergedTransparency: false,
    mergedImage: info.merged
      ? { compression: 'source-backed', alpha: false, matte: true, size: Number(info.merged.length) }
      : null,
    notes: [
      'Source-backed saved image may be stale; original matte retained. Alpha interpretation, profiles, comps and document-wide state are not imported.'
    ]
  };
}

function sourceNode(layer: import('@app-game/psd/viewer').PsdSourceLayer): PsdLayerNode {
  return {
    index: layer.index,
    name: layer.name,
    kind: 'pixel',
    bounds: { left: layer.left, top: layer.top, right: layer.left + layer.width, bottom: layer.top + layer.height },
    visible: true,
    opacity: 255,
    fill: 255,
    blendMode: 'normal',
    clipped: false,
    background: false,
    transparencyShapesLayer: true,
    legacyOpacity: null,
    mask: null,
    vectorMask: null,
    effects: null,
    keys: [],
    notes: ['Source metadata only; visibility and blend state are unavailable.']
  };
}

function sourceDetail(layer: import('@app-game/psd/viewer').PsdSourceLayer): PsdLayerDetail {
  return {
    index: layer.index,
    name: layer.name,
    kind: 'pixel',
    properties: {
      blendMode: 'unavailable',
      blendKey: '',
      opacity: 255,
      fill: 255,
      legacyOpacity: null,
      visible: true,
      clipped: false,
      transparencyLocked: false,
      knockout: 'none',
      blendClippedAsGroup: false,
      blendInteriorAsGroup: false,
      transparencyShapesLayer: false,
      layerMaskHidesEffects: false,
      vectorMaskHidesEffects: false,
      bounds: sourceNode(layer).bounds,
      channels: layer.channels.map((channel) => channel.id),
      blendIf: null
    },
    mask: null,
    vectorMask: null,
    effects: null,
    adjustment: null,
    text: null,
    smartObject: null,
    notes: ['Bounded original source channels only; rendering properties are unavailable.'],
    blocks: []
  };
}

function layerPreviewRect(detail: PsdLayerDetail, info: PsdInfo): PsdRegionRect {
  const bounds = detail.properties.bounds;
  const left = Math.max(0, Math.min(info.width - 1, bounds.left));
  const top = Math.max(0, Math.min(info.height - 1, bounds.top));
  return {
    left,
    top,
    width: Math.max(1, Math.min(256, info.width - left, bounds.right - left)),
    height: Math.max(1, Math.min(256, info.height - top, bounds.bottom - top))
  };
}

function channelPreview(
  region: import('@app-game/psd/viewer').PsdNativeRegion,
  rect: PsdRegionRect
): PsdSavedProcessChannels & { left: number; top: number } {
  return {
    ...rect,
    depth: region.depth,
    mode: region.mode,
    planes: region.planes.map((plane) => ({
      index: plane.id,
      bytes: plane.bytes,
      name: `Channel ${plane.id}`,
      role:
        plane.id < (region.mode === 4 ? 4 : region.mode === 3 || region.mode === 9 ? 3 : 1) ? 'process' : 'auxiliary',
      visible: true
    })),
    colorModeData: new Uint8Array(),
    resources: [],
    metadataError: 'Bounded planes only; channel names and profile metadata are not imported.',
    source: region.source
  };
}

function layerPreview(
  region: import('@app-game/psd/viewer').PsdNativeRegion,
  rect: PsdRegionRect,
  detail: PsdLayerDetail
): import('./protocol').PsdResultOf<PsdLayerPixels> {
  if (![0, 1, 3].includes(region.mode)) {
    return {
      ok: false,
      error: {
        kind: 'unsupported',
        message: 'Native layer channels are available; this layer preview requires RGB/Gray display conversion.'
      }
    };
  }
  const pixels = region.planes.some((plane) => plane.id >= 0)
    ? wireDisplay(region, rect).pixels
    : new Uint8Array(rect.width * rect.height * 4);
  const masks = region.planes
    .filter((plane) => plane.id === -2 || plane.id === -3)
    .map((plane) => {
      const maximum = region.depth === 16 ? 65535 : region.depth === 8 ? 255 : 1;
      const values = Uint8Array.from({ length: plane.width * plane.height }, (_, i) =>
        Math.round(
          ((wireSample(region, plane.id, plane.left + (i % plane.width), plane.top + Math.floor(i / plane.width)) ??
            0) /
            maximum) *
            255
        )
      );
      const mask = detail.mask && !('error' in detail.mask) ? detail.mask : undefined;
      const metadata = plane.id === -3 ? mask?.real : mask;
      return { ...plane, values, defaultColor: metadata?.defaultColor ?? 255, disabled: metadata?.disabled ?? false };
    });
  return { ok: true, value: { ...rect, pixels, masks } };
}
