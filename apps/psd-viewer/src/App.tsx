import { createMemo, createSignal, Errored, isPending, latest, onCleanup, Show } from 'solid-js';
import styles from './App.module.css';
import { createBlendingDetection } from './features/blending-detection';
import { createComparison, DifferenceSummary, ViewSwitch, type ViewMode } from './features/comparison';
import { ComparisonTools } from './features/comparison/ComparisonTools';
import { presentationSource } from './features/comparison/presentation';
import { createPsdDocument, createPsdRender, type PsdSource } from './features/document';
import { createOpeningPreview } from './features/document/createOpeningPreview';
import { ExamplesMenu } from './features/examples';
import { ExportPanel } from './features/export/ExportPanel';
import { createFonts, FontsPanel, TextSupportSection } from './features/fonts';
import { GpuViewport } from './features/gpu-viewport/GpuViewport';
import type { DisplayImage } from './features/gpu-viewport/displayTiles';
import { InspectionPanel } from './features/inspection/InspectionPanel';
import { NativeInspection } from './features/inspection/NativeInspection';
import { PathOverlay } from './features/inspection/PathOverlay';
import { admittedMask, maskImage } from './features/inspection/pixels';
import { DocumentInspector, LayerInspector } from './features/inspector';
import { collectNotes, createLayerVisibility, LayersPanel, layerVisibility } from './features/layers';
import { BoundsOverlay } from './features/layers/BoundsOverlay';
import { contentBounds, findLayer } from './features/layers/layerTree';
import { Navigator } from './features/navigation/Navigator';
import { createFileDrop, fileSource, firstPsd, urlSource } from './features/open-file';
import { OpenFailure } from './features/open-file/OpenFailure';
import { createOpenPrompt, OpeningReport, OpenPromptDialog } from './features/open-like-photoshop';
import { createPsdWorker, makePsdClient, type PsdResultOf, type WorkerFailure } from './features/psd-worker';
import { makePsdWorkerPool } from './features/psd-worker/makePsdWorkerPool';
import { inspectionRect } from './features/psd-worker/nativePixels';
import { requiresWindowedRendering } from './features/psd-worker/protocol';
import { createRenderSettings, RenderSettingsPanel } from './features/render-settings';
import { ariaState } from './features/shared/format';
import { createStateChoice, StatesPanel } from './features/states';
import { StatusArea } from './features/status';
import { viewerPerformance } from './features/telemetry/performance';
import { createViewport } from './features/viewport';
import { RgbaCanvas } from './features/viewport/RgbaCanvas';
import { createWindowedRender } from './features/viewport/createWindowedRender';

/**
 * PSD Viewer: opens a Photoshop document in a worker, renders it with the Rust compositor and compares the result with
 * the merged image Photoshop saved. The screen is assembled here from independent features: the worker client and
 * document session, opening files as Photoshop does with its prompts, layer visibility, render settings with the gamma blending options detected per document, the fonts for
 * re-rendering text, the saved layer comps and animation frames to render, the zoomable viewport, the comparison views,
 * the inspector and the renderer status.
 */
export function App() {
  const initialWorkers = new URLSearchParams(location.search).get('workers') === '2' ? 2 : 1;
  const [workerCount, setWorkerCount] = createSignal<1 | 2>(initialWorkers);
  const client = makePsdWorkerPool(makePsdClient(createPsdWorker(), createPsdWorker), createPsdWorker, {
    workers: initialWorkers,
    // Repeated DPR 2 measurements regressed interaction p95. Keep that display on the serial baseline.
    parallelAllowed: () => devicePixelRatio <= 1
  });
  const [displayBusy, setDisplayBusy] = createSignal(false);
  // An empty tile set initializes the same display scope while the document worker opens the file.
  const openingDisplay: DisplayImage = { width: 0, height: 0, pixels: new Uint8Array(0) };
  onCleanup(client.dispose);

  const { source, opened, opening, canceled, open, cancel, retry } = createPsdDocument(client);
  const { prompt, answer } = createOpenPrompt(source, opened, open);
  const { settings: stored, update, replace, reset } = createRenderSettings();
  const { overrides, pairs, setVisible, restoreSaved, solo } = createLayerVisibility(source);
  const initial = createOpeningPreview(client, opened, stored);
  const blending = createBlendingDetection(client, opened, stored, pairs, initial.ready);
  const settings = blending.settings;
  const [selected, setSelected] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const fonts = createFonts(client, () => (initial.ready() ? opened() : undefined), selected);
  const { choice: stateChoice, choose: chooseState, withState } = createStateChoice(source);
  const document = () => valueOf(opened());
  const viewport = createViewport(() => document()?.info, source);
  const windowed = () =>
    Boolean(document() && requiresWindowedRendering((valueOf(plannedOpened()) ?? document())!.info));
  const renderSettings = fonts.withFonts(withState(settings));
  const capability = createMemo(() => {
    const current = document();
    return current &&
      !current.sourceBacked &&
      (requiresWindowedRendering({ width: current.info.width, height: current.info.height }) || initial.ready())
      ? client.capability(current.document, renderSettings(), pairs())
      : undefined;
  });
  const plannedOpened = createMemo(() => {
    const current = opened();
    const plan = capability();
    return current?.ok && plan?.ok && current.value.info.windowed !== plan.value.windowed
      ? {
          ok: true as const,
          value: { ...current.value, info: { ...current.value.info, windowed: plan.value.windowed } }
        }
      : current;
  });
  const wholeRender = createPsdRender(
    client,
    () => (blending.settled() ? plannedOpened() : undefined),
    renderSettings,
    pairs
  );
  const windows = createWindowedRender(
    client,
    () => {
      const current = plannedOpened();
      return (current?.ok &&
        requiresWindowedRendering({
          width: current.value.info.width,
          height: current.value.info.height
        })) ||
        initial.ready()
        ? current
        : undefined;
    },
    renderSettings,
    pairs,
    viewport
  );
  const render = () => (windowed() ? windows.render() : wholeRender());
  const renderWindow = () => valueOf(render())?.window;
  const { view, setView, merged, difference, blinkSaved, wipe, setWipe } = createComparison(
    client,
    opened,
    render,
    () => (initial.preview()?.source === 'saved' ? initial.preview()?.image : undefined)
  );

  const [revealed, setRevealed] = createSignal(() => {
    source();
    return false;
  });
  const selectedBounds = () =>
    selected() === undefined ? undefined : findLayer(document()?.layers ?? [], selected()!)?.bounds;

  const [layerWindow, setLayerWindow] = createSignal<ReturnType<typeof inspectionRect> | undefined>(() => {
    selected();
    source();
    return undefined;
  });
  const [tab, setTab] = createSignal<'layer' | 'document'>('document');
  const layer = createMemo(() => {
    const document = opened();
    const index = selected();
    return document?.ok && index !== undefined
      ? client.layer(document.value.document, index, layerWindow())
      : undefined;
  });
  const selectLayer = (index: number) => {
    setSelected(index);
    setTab('layer');
  };

  // An unanswered prompt shows as the prompt dialog, not as a failure.
  const openFailure = () => {
    const failure = failureOf(opened());
    return failure?.kind === 'needsAnswer' ? undefined : failure;
  };
  const layerContents = () => valueOf(layer());
  const [point, setPoint] = createSignal<{ x: number; y: number; viewportX: number }>();
  const [channelDocument, setChannelDocument] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const [pathDocument, setPathDocument] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const [channelPoint, setChannelPoint] = createSignal<{ x: number; y: number }>();
  const channels = createMemo(() =>
    document() && channelDocument() === document()!.document
      ? client.channels(document()!.document, inspectionRect(document()!.info, channelPoint()))
      : undefined
  );
  const paths = createMemo(() =>
    document() && pathDocument() === document()!.document ? client.paths(document()!.document) : undefined
  );
  const [selectedPath, setSelectedPath] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const path = () => {
    const value = valueOf(paths())?.[selectedPath() ?? -1];
    return value?.outcome === 'geometry' ? value : undefined;
  };
  const [nativePoint, setNativePoint] = createSignal<{ x: number; y: number } | undefined>(() => {
    source();
    return undefined;
  });
  const native = createMemo(() => {
    const current = document();
    const point = nativePoint();
    return current && point
      ? client.inspect(
          current.document,
          { left: point.x, top: point.y, width: 1, height: 1 },
          renderSettings(),
          pairs()
        )
      : undefined;
  });
  const [maskMode, setMaskMode] = createSignal<'off' | 'overlay' | 'only'>(() => {
    selected();
    source();
    return 'off' as const;
  });
  const [maskIndex, setMaskIndex] = createSignal(() => {
    selected();
    source();
    return 0;
  });
  const layerPixels = () => layerContents()?.pixels;
  const selectedPixels = () => {
    const pixels = layerPixels();
    return pixels?.ok ? pixels.value : undefined;
  };
  const masks = () => {
    const pixels = layerPixels();
    return pixels?.ok ? pixels.value.masks : [];
  };
  const mask = createMemo(() => admittedMask(masks()[maskIndex()], document()?.info));
  const maskPixels = createMemo(() =>
    mask() && maskMode() !== 'off' ? maskImage(mask()!, maskMode() === 'overlay') : undefined
  );
  const documentFonts = () => valueOf(fonts.report());
  const layerTextSupport = () => valueOf(fonts.layerSupport());
  const layerFailure = () => failureOf(layer());
  const differenceValue = () => valueOf(difference());
  const shown = createMemo<DisplayImage | undefined>(() => {
    if (maskMode() === 'only' && maskPixels()) {
      return maskPixels();
    }

    const result =
      view() === 'photoshop' || (view() === 'blink' && blinkSaved())
        ? merged()
        : view() === 'difference'
          ? difference()
          : latest(render);
    return result?.ok ? result.value : view() === 'ours' && !result ? initial.preview()?.image : undefined;
  });
  const inspectionImage = () => {
    const split = view() === 'split' || view() === 'wipe';
    const screenX = point()?.viewportX ?? 0;
    const divider = (viewport.size().width * (view() === 'split' ? 50 : wipe())) / 100;
    return split && maskMode() !== 'only' && screenX >= divider ? valueOf(merged()) : shown();
  };
  const presentation = () =>
    presentationSource({
      view: view(),
      state: stateChoice() === null ? 'document-as-saved state' : JSON.stringify(stateChoice()),
      overrides: pairs().length,
      maskOnly: maskMode() === 'only',
      maskOverlay: maskMode() === 'overlay',
      blinkSaved: blinkSaved(),
      initial: !latest(render) ? initial.preview()?.source : undefined,
      savedWindow: renderWindow()?.source === 'savedComposite',
      savedSnapshot: document()?.sourceBacked,
      hasRender: Boolean(latest(render)?.ok),
      pending: isPending(wholeRender) || (view() === 'difference' && isPending(difference))
    });
  const shownFailure = () => {
    const result = view() === 'photoshop' ? merged() : view() === 'difference' ? difference() : render();
    return result && !result.ok && result.error.kind !== 'superseded' && result.error.kind !== 'stale'
      ? result.error
      : undefined;
  };
  const layerNotes = createMemo(() => collectNotes(document()?.layers ?? []));
  const savedStates = () => {
    const states = document()?.states;
    return states?.comps.length || states?.frames.length || states?.errors.length ? states : undefined;
  };

  const activity = () => {
    if (opening()) {
      return `Opening ${latest(source)?.name ?? ''}…`;
    }

    if (document() && !blending.settled()) {
      return initial.ready() ? 'Detecting blending…' : 'Loading preview…';
    }

    if (windows.busy() || isPending(wholeRender)) {
      return 'Rendering…';
    }

    if (isPending(difference) || isPending(merged)) {
      return 'Comparing…';
    }

    if (displayBusy()) {
      return 'Displaying…';
    }

    return isPending(layer) ? 'Reading layer…' : undefined;
  };

  /** Opens a source, adopting the settings it was captured with. */
  function openSource(next: PsdSource) {
    open(next);
    if (next.settings) {
      replace(next.settings);
    }
  }

  const drop = createFileDrop((files) => {
    const file = firstPsd(files);
    if (file) {
      openSource(fileSource(file));
    }
  });
  let input!: HTMLInputElement;

  return (
    <div class={[styles.viewer, styles.workspace]} {...drop.handlers}>
      <header class={styles.toolbar}>
        <h1>PSD Viewer</h1>
        <span class={styles.documentName}>{latest(source)?.name ?? 'No document'}</span>
        <ExamplesMenu onOpen={(example) => openSource(urlSource(example.file, example.url, example.settings))} />
        <button type="button" onClick={() => input.click()}>
          Open…
        </button>
        <input
          ref={(element) => (input = element)}
          type="file"
          accept=".psd,.psb"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              openSource(fileSource(file));
            }

            event.currentTarget.value = '';
          }}
        />
        <Show when={source()}>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </Show>
        <Show when={canceled()}>
          <button type="button" onClick={() => retry()}>
            Restart
          </button>
        </Show>
        <span class={styles.spacer} />
        <ViewSwitch
          view={latest(view)}
          onView={(next: ViewMode) => setView(next)}
          disabled={!document()}
          windowed={windowed()}
        />
        <select
          aria-label="Tile workers"
          value={workerCount()}
          title="Two workers require DPR 1, independent RGB8/Gray8 windows and a 3 GiB accounted budget. Supplied fonts use one worker."
          onChange={(event) => {
            const count = event.currentTarget.value === '2' ? 2 : 1;
            client.setWorkers(count);
            setWorkerCount(count);
          }}
        >
          <option value="1">1 worker</option>
          <option value="2">2 workers when admitted</option>
        </select>
        <div class={styles.zoom} role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={viewport.zoomOut}>
            −
          </button>
          <input
            aria-label="Zoom percentage"
            type="number"
            min="0.002"
            max="6400"
            step="10"
            value={viewport.percent()}
            style={{ width: '65px' }}
            onChange={(event) => viewport.setPercent(event.currentTarget.valueAsNumber)}
          />
          %
          <button type="button" aria-label="Zoom in" onClick={viewport.zoomIn}>
            +
          </button>
          <button type="button" aria-pressed={ariaState(viewport.isFitted())} onClick={viewport.fit}>
            Fit
          </button>
          <button type="button" onClick={() => viewport.fitBounds(contentBounds(document()?.layers ?? []))}>
            Fit content
          </button>
          <button
            type="button"
            disabled={selected() === undefined}
            onClick={() => viewport.fitBounds(selectedBounds())}
          >
            Fit selection
          </button>
          <button type="button" onClick={viewport.actualSize}>
            100%
          </button>
        </div>
      </header>
      <Errored
        fallback={(error) => (
          <div class={styles.crash} role="alert">
            <p>The renderer stopped: {String(error())}</p>
            <button type="button" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        )}
      >
        <main class={styles.panels}>
          <aside class={styles.layers} aria-label="Layers panel">
            <header class={styles.panelHeading}>
              <h2>Layers</h2>
              <span>{document() ? `${document()!.info.layerRecords} records` : ''}</span>
            </header>
            <Show when={document()} fallback={<p class={styles.empty}>Open a document to see its layers.</p>}>
              {(current) => (
                <LayersPanel
                  layers={current().layers}
                  visibleOf={(node) => latest(overrides).get(node.index) ?? node.visible}
                  onVisible={setVisible}
                  selected={latest(selected)}
                  onSelect={selectLayer}
                  onReveal={() => setRevealed(true)}
                  onFit={() => {
                    setRevealed(true);
                    viewport.fitBounds(selectedBounds());
                  }}
                  onSolo={() => {
                    if (selected() !== undefined) {
                      solo(current().layers, selected()!);
                    }
                  }}
                  onReset={restoreSaved}
                />
              )}
            </Show>
          </aside>
          <section class={styles.stage}>
            <Show when={view() !== 'ours' && view() !== 'photoshop'}>
              <ComparisonTools
                view={view()}
                state={stateChoice() === null ? 'document as saved' : JSON.stringify(stateChoice())}
                overrides={pairs().length}
                difference={differenceValue()}
                wipe={wipe()}
                onWipe={setWipe}
                onMismatch={(point) => {
                  viewport.centerOn(point);
                }}
              />
            </Show>
            <p class={styles.provenance}>Viewing {presentation()}. Display RGB8. Source PSD is unchanged.</p>
            <div
              ref={viewport.setElement}
              class={styles.viewport}
              tabindex={0}
              aria-label="Canvas. Arrow keys pan; plus and minus zoom; 0 fits document; 1 shows actual size."
              {...viewport.surface}
              onPointerMove={(event) => {
                viewport.surface.onPointerMove(event);
                const rect = event.currentTarget.getBoundingClientRect();
                const camera = viewport.view();
                setPoint({
                  viewportX: event.clientX - rect.left,
                  x: Math.floor((event.clientX - rect.left - camera.x) / camera.scale),
                  y: Math.floor((event.clientY - rect.top - camera.y) / camera.scale)
                });
              }}
              data-view={view()}
              data-camera-scale={viewport.view().scale}
              data-camera-x={viewport.view().x}
              data-camera-y={viewport.view().y}
              data-busy={activity() ? 'true' : 'false'}
              data-render-source={renderWindow()?.source}
              data-render-step={renderWindow()?.step}
              data-render-id={(() => {
                const current = render();
                return current?.ok ? current.value.render : undefined;
              })()}
            >
              <Show when={opening() || document() || shown()}>
                <GpuViewport
                  image={shown() ?? openingDisplay}
                  onPresented={initial.presented}
                  onBusyChange={setDisplayBusy}
                  onInteractionLatency={client.reportInteraction}
                  view={viewport.view()}
                  size={viewport.size()}
                  label={
                    !shown()
                      ? 'Preparing display'
                      : maskMode() === 'only'
                        ? 'Saved mask only'
                        : view() === 'blink' && blinkSaved()
                          ? "Photoshop's merged image"
                          : view() === 'ours' || view() === 'split' || view() === 'wipe' || view() === 'blink'
                            ? !latest(render) && initial.preview()
                              ? 'Opening preview'
                              : 'Our render'
                            : view() === 'photoshop'
                              ? "Photoshop's merged image"
                              : 'Difference heat map'
                  }
                />
              </Show>
              <Show when={(view() === 'split' || view() === 'wipe') && maskMode() !== 'only' && valueOf(merged())}>
                {(saved) => (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      'pointer-events': 'none',
                      'clip-path': `inset(0 0 0 ${view() === 'split' ? 50 : wipe()}%)`
                    }}
                  >
                    <GpuViewport
                      image={saved()}
                      view={viewport.view()}
                      size={viewport.size()}
                      label="Comparison saved composite"
                    />
                  </div>
                )}
              </Show>
              <Show when={(view() === 'split' || view() === 'wipe') && maskMode() !== 'only'}>
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${view() === 'split' ? 50 : wipe()}%`,
                    border: '1px solid #55b5ea',
                    'pointer-events': 'none'
                  }}
                />
              </Show>
              <Show when={maskMode() === 'overlay' && maskPixels()}>
                {(image) => (
                  <RgbaCanvas
                    image={image()}
                    label="Saved mask red overlay"
                    style={{
                      position: 'absolute',
                      'pointer-events': 'none',
                      left: `${viewport.view().x + mask()!.left * viewport.view().scale}px`,
                      top: `${viewport.view().y + mask()!.top * viewport.view().scale}px`,
                      width: `${mask()!.width * viewport.view().scale}px`,
                      height: `${mask()!.height * viewport.view().scale}px`,
                      'image-rendering': 'pixelated'
                    }}
                  />
                )}
              </Show>
              <Show when={path()}>{(saved) => <PathOverlay path={saved()} view={viewport.view()} />}</Show>
              <Show when={revealed() && selectedBounds()}>
                {(bounds) => <BoundsOverlay bounds={bounds()} view={viewport.view()} />}
              </Show>
              <Show when={initial.preview() && !latest(render)}>
                <p class={styles.previewLabel} role="note" data-preview={initial.preview()?.source}>
                  {initial.preview()?.source === 'saved'
                    ? 'Saved preview · possibly stale saved pixels'
                    : 'Chosen-settings preview · verifying blending'}
                </p>
              </Show>
              <Show when={windowed() && latest(render)?.ok}>
                <p class={styles.canvasStatus} role="status" aria-label="Canvas render status">
                  {valueOf(render())?.window?.source === 'savedComposite'
                    ? 'Possibly stale saved pixels'
                    : valueOf(render())?.approximations.length
                      ? 'Current layers · approximated'
                      : 'Current layers'}
                  <Show when={valueOf(render())?.quality}>
                    {(quality) => (
                      <>
                        {' '}
                        · {quality().completed}/{quality().required} tiles
                      </>
                    )}
                  </Show>
                </p>
              </Show>
              <Show when={!latest(source)}>
                <div class={styles.welcome}>
                  <h2>Drop a PSD or PSB here</h2>
                  <p>Or use Open… or Examples…. Files stay on this computer; rendering runs in a worker.</p>
                </div>
              </Show>
              <Show when={openFailure()}>
                {(failure) => (
                  <OpenFailure
                    name={source()?.name ?? ''}
                    failure={failure()}
                    class={styles.message}
                    onStrict={() => retry('strict')}
                  />
                )}
              </Show>
              <Show when={document() && shownFailure()}>
                {(error) => (
                  <div class={styles.message} role="alert">
                    {error().kind === 'unsupported' ? 'Not rendered — unsupported: ' : ''}
                    {error().message}
                  </div>
                )}
              </Show>
              <Show when={view() === 'difference' && differenceValue()}>
                {(value) => <DifferenceSummary difference={value()} />}
              </Show>
              <Show when={activity()}>
                <div class={styles.busy} role="progressbar" aria-label={activity()}>
                  <span class={styles.spinner} aria-hidden="true" />
                  {activity()}
                </div>
              </Show>
            </div>
            <Show when={document()}>
              {(current) => (
                <>
                  <Show when={current().sourceBacked}>
                    <button
                      onClick={() => {
                        const current = source();
                        if (current) {
                          open({ ...current, mode: 'strict' });
                        }
                      }}
                    >
                      Render current layers
                    </button>
                  </Show>
                  <details class={styles.diagnostics} aria-label="Document diagnostics">
                    <summary>Diagnostics · {valueOf(render())?.approximations.length ?? 0} approximations</summary>
                    <OpeningReport opening={current().opening} />
                    <Show when={source()?.mode === 'strict'}>
                      <p role="note">
                        Strict reading. Photoshop recovery and repairs were skipped. Layers may differ from a recovered
                        opening; Photoshop view shows the saved composite when available.
                      </p>
                    </Show>
                    <Show when={windowed()}>
                      <p role="note">
                        Windowed layer view. Your blending preferences apply. Automatic blending detection and
                        whole-image comparison are disabled for this view.
                      </p>
                    </Show>
                    <Show when={current().sourceBacked}>
                      <p role="note">
                        Source-backed saved view. May be stale; settings and visibility do not alter saved pixels.{' '}
                        {current().sourceLayerFailure?.message}
                      </p>
                    </Show>
                    <details aria-label="Region capability diagnostics">
                      <summary>Region capability and admission</summary>
                      <pre style={{ 'white-space': 'pre-wrap' }}>
                        {JSON.stringify(
                          capability() ??
                            current().capability ?? {
                              sourceBacked: current().sourceBacked,
                              layerRefusal: current().sourceLayerFailure
                            },
                          (_, value) => (typeof value === 'bigint' ? value.toString() : value),
                          2
                        )}
                      </pre>
                      <p>
                        Storage plan only. The caller rounds required live storage to 64 MiB above a 512 MiB baseline,
                        up to 2 GiB. Allocation cap unchanged. Source sessions read bounded host file slices.
                      </p>
                    </details>
                    <StatusArea
                      render={render()}
                      windowed={windowed()}
                      sourceBacked={current().sourceBacked}
                      layerNotes={layerNotes()}
                      documentNotes={current().info.notes}
                      onSelect={selectLayer}
                    />
                  </details>
                </>
              )}
            </Show>
          </section>
          <aside class={styles.inspector} aria-label="Inspector">
            <Show when={document()}>
              {(current) => (
                <Navigator
                  image={shown()}
                  document={current().info}
                  view={viewport.view()}
                  size={viewport.size()}
                  onCenter={viewport.centerOn}
                />
              )}
            </Show>
            <RenderSettingsPanel
              settings={latest(settings)}
              detected={{
                linearBlending: latest(blending.detected).linearBlending !== null,
                textGamma: latest(blending.detected).textGamma !== null
              }}
              onChange={(patch) => {
                if ('linearBlending' in patch) {
                  blending.choose({ linearBlending: patch.linearBlending });
                }

                if ('textGamma' in patch) {
                  blending.choose({ textGamma: patch.textGamma });
                }

                update(patch);
              }}
              onReset={() => {
                blending.choose({ linearBlending: undefined, textGamma: undefined });
                reset();
              }}
            />
            <Show when={savedStates()}>
              {(states) => (
                <StatesPanel
                  states={states()}
                  choice={stateChoice()}
                  busy={Boolean(activity())}
                  onChoose={chooseState}
                />
              )}
            </Show>
            <Show when={documentFonts()?.layers.length ? documentFonts() : undefined}>
              {(report) => (
                <FontsPanel
                  report={report()}
                  render={render()}
                  visibleOf={(index) =>
                    stateChoice() ? undefined : layerVisibility(document()?.layers ?? [], index, latest(overrides))
                  }
                  library={valueOf(fonts.library()) ?? []}
                  reRender={latest(settings).typeLayers}
                  onReRender={(typeLayers) => update({ typeLayers })}
                  ready={fonts.ready()}
                  missing={fonts.missing()}
                  adding={fonts.adding()}
                  refusals={fonts.refusals()}
                  canUseInstalled={fonts.canUseInstalled}
                  onUseInstalled={() => void fonts.useInstalled()}
                  onFiles={(files) => void fonts.addFiles(files)}
                />
              )}
            </Show>
            <Show when={document()}>
              <ExportPanel
                name={source()?.name ?? 'document.psd'}
                state={
                  stateChoice() === null
                    ? 'document-as-saved'
                    : JSON.stringify(stateChoice()).replace(/[^a-z0-9]/gi, '-')
                }
                viewportSource={presentation()}
                fidelity={
                  valueOf(render())?.approximations.join('; ') || 'Current render has no reported approximations.'
                }
                busy={Boolean(activity())}
                shown={shown()}
                full={windowed() ? undefined : valueOf(render())}
                view={viewport.view()}
                size={viewport.size()}
                comparison={
                  (view() === 'split' || view() === 'wipe') && valueOf(merged()) && maskMode() !== 'only'
                    ? { image: valueOf(merged())!, divider: view() === 'split' ? 50 : wipe() }
                    : undefined
                }
                overlay={maskMode() === 'overlay' ? maskPixels() : undefined}
                layer={selectedPixels()}
                layerName={layerContents()?.detail.name ?? 'layer'}
                mask={mask()}
                onOriginal={async () => {
                  const result = await client.original(document()!.document);
                  if (!result.ok) {
                    throw new Error(result.error.message);
                  }
                  return result.value;
                }}
                report={() => ({
                  source: source()?.name,
                  originalUnchanged: true,
                  info: document()?.info,
                  capability: capability() ?? document()?.capability,
                  sourceBacked: document()?.sourceBacked,
                  sourceLayerFailure: document()?.sourceLayerFailure,
                  opening: document()?.opening,
                  state: stateChoice(),
                  renderSettings: renderSettings(),
                  transientVisibility: pairs(),
                  fidelity: 'display RGB8',
                  performance: viewerPerformance.snapshot(),
                  presentation: presentation(),
                  viewport: { camera: viewport.view(), size: viewport.size(), mode: view(), wipe: wipe() },
                  savedMask: { index: maskIndex(), mode: maskMode() },
                  render: (() => {
                    const value = valueOf(render());
                    return (
                      value && {
                        render: value.render,
                        depth: value.depth,
                        approximations: value.approximations,
                        quality: value.quality,
                        window: value.window
                      }
                    );
                  })(),
                  comparison: differenceValue() && {
                    unit: differenceValue()!.unit,
                    max: differenceValue()!.max,
                    differingSamples: differenceValue()!.differingSamples
                  }
                })}
              />
              <NativeInspection
                result={native()}
                onInspect={() => {
                  const p = point();
                  const size = document()?.info;
                  if (p && size && p.x >= 0 && p.y >= 0 && p.x < size.width && p.y < size.height) {
                    setNativePoint({ x: p.x, y: p.y });
                  }
                }}
              />
              <InspectionPanel
                image={inspectionImage()}
                point={point()}
                channels={channels()}
                paths={paths()}
                onChannels={() => {
                  setChannelPoint(point());
                  setChannelDocument(document()!.document);
                }}
                onPaths={() => setPathDocument(document()!.document)}
                selectedPath={selectedPath()}
                onPath={setSelectedPath}
                maskMode={maskMode()}
                onMaskMode={setMaskMode}
                hasMask={Boolean(mask())}
                masks={masks()}
                maskIndex={maskIndex()}
                onMaskIndex={setMaskIndex}
              />
            </Show>
            <div class={styles.tabs} role="group" aria-label="Inspector view">
              <button type="button" aria-pressed={ariaState(tab() === 'layer')} onClick={() => setTab('layer')}>
                Layer
              </button>
              <button type="button" aria-pressed={ariaState(tab() === 'document')} onClick={() => setTab('document')}>
                Document
              </button>
            </div>
            <div class={styles.inspectorBody}>
              <Show when={document()} fallback={<p class={styles.empty}>No document.</p>}>
                {(current) => (
                  <Show
                    when={tab() === 'layer'}
                    fallback={<DocumentInspector info={current().info} name={source()?.name ?? ''} />}
                  >
                    <Show
                      when={layerContents()}
                      fallback={<p class={styles.empty}>{layerFailure()?.message ?? 'Select a layer.'}</p>}
                    >
                      {(contents) => (
                        <>
                          <p role="note">
                            Saved-record properties and pixels. Comp/frame transforms and transient visibility do not
                            change this inspection.
                          </p>
                          <button
                            disabled={!point()}
                            onClick={() => {
                              const current = document();
                              if (current) {
                                setLayerWindow(inspectionRect(current.info, point()));
                              }
                            }}
                          >
                            Read layer window at pointer
                          </button>
                          <LayerInspector contents={contents()} />
                          <Show when={layerTextSupport()}>
                            {(support) => <TextSupportSection support={support()} />}
                          </Show>
                        </>
                      )}
                    </Show>
                  </Show>
                )}
              </Show>
            </div>
          </aside>
        </main>
      </Errored>
      <footer class={styles.status} role="status">
        <span>
          <Show when={activity()}>
            <span class={styles.spinnerSmall} aria-hidden="true" />
          </Show>
          {activity() ?? statusText()}
        </span>
        <span>
          {document()
            ? `${document()!.info.width} × ${document()!.info.height} · ${document()!.info.depth}-bit ${document()!.info.modeName}`
            : ''}
        </span>
      </footer>
      <Show when={drop.dragging()}>
        <div class={styles.dropIndicator}>Drop to open</div>
      </Show>
      <Show when={prompt()}>
        {(asked) => (
          <OpenPromptDialog
            prompt={asked()}
            name={latest(source)?.name ?? ''}
            onAnswer={(choice) => answer(asked(), choice)}
          />
        )}
      </Show>
    </div>
  );

  /** The settled state in words: the last render's time or why there is none. */
  function statusText() {
    const current = render();
    if (openFailure()) {
      return 'Failed to open';
    }

    if (canceled()) {
      return 'Canceled';
    }

    if (!document()) {
      return 'Ready';
    }

    if (!current?.ok) {
      return current?.error.kind === 'unsupported'
        ? 'Not rendered: unsupported feature, see the status below the canvas'
        : 'Not rendered';
    }

    if (current.value.window?.source === 'savedComposite') {
      return document()?.sourceBacked
        ? 'Source-backed saved composite, may be stale'
        : 'Temporary saved preview, rendering fresh layers…';
    }

    const approximate = current.value.approximations.length ? ', approximated' : '';
    return `Rendered ${current.value.width} × ${current.value.height} at ${current.value.depth} bits in ${Math.round(current.value.milliseconds)} ms${approximate}`;
  }
}

/** The value of a settled result, `undefined` before one or after a failure. */
function valueOf<T>(result: PsdResultOf<T> | undefined): T | undefined {
  return result?.ok ? result.value : undefined;
}

/** The failure of a settled result. */
function failureOf<T>(result: PsdResultOf<T> | undefined): WorkerFailure | undefined {
  return result && !result.ok ? result.error : undefined;
}
