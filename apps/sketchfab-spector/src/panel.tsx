import { For, Loading, Show, lazy } from 'solid-js';
import type { createInspectorSession } from './inspector-session';

/** Pure panel presentation; all page operations and reactive state belong to the session. */
export function SpectorDevToolsPanel(props: { session: ReturnType<typeof createInspectorSession> }) {
  const {
    frames,
    selectedFrame,
    selectedCanvas,
    canvasCount,
    captures,
    showResults,
    refreshing,
    activeCapture,
    capturePending,
    busyMessage,
    errorMessage,
    refresh,
    selectCanvas,
    isSelected,
    openResults,
    closeResults,
    addCapture,
    capture,
    stopCapture,
    compileProgram,
    readMesh,
    readScene,
    readTexture
  } = props.session;
  return (
    <main class="panel-shell">
      <Show
        when={!showResults()}
        fallback={
          <section class="result-shell">
            <Loading
              fallback={
                <p class="empty-message" role="status">
                  Loading capture viewer…
                </p>
              }
            >
              <SpectorResultView
                captures={captures()}
                onAddCapture={addCapture}
                onCompileProgram={compileProgram}
                onReadMesh={readMesh}
                onReadScene={readScene}
                onReadTexture={readTexture}
                onClose={closeResults}
              />
            </Loading>
          </section>
        }
      >
        <header class="panel-header">
          <div class="brand">
            <span class="brand-mark" aria-hidden="true" />
            <div>
              <h1>WebGL Spector</h1>
              <p>
                {canvasCount()} canvases across {frames().length} frames
              </p>
            </div>
          </div>
          <div class="header-actions">
            <Show when={captures().length > 0}>
              <button class="button quiet" type="button" onClick={() => openResults()}>
                Captures ({captures().length})
              </button>
            </Show>
            <button class="button quiet" type="button" onClick={() => void refresh()} disabled={refreshing()}>
              Refresh
            </button>
          </div>
        </header>

        <Show when={busyMessage()}>
          <div class="notice progress" role="status">
            <span class="activity-spinner" aria-hidden="true" />
            <span>{busyMessage()}</span>
          </div>
        </Show>
        <Show when={errorMessage()}>
          {(message) => (
            <div class="notice error" role="alert">
              {message()}
            </div>
          )}
        </Show>

        <div class="workspace">
          <aside class="canvas-browser">
            <div class="section-heading">
              <span>Page canvases</span>
              <span class="count">{canvasCount()}</span>
            </div>
            <Show
              when={frames().length > 0}
              fallback={<p class="empty-message">No canvas elements found in the inspected page or its frames.</p>}
            >
              <For each={frames()}>
                {(frame) => (
                  <section class="frame-group">
                    <div class="frame-heading" title={frame.target.url}>
                      <span>{frame.snapshot?.documentTitle || frameHost(frame.target.url)}</span>
                      <span class="duplicate-badge">
                        {frame.target.isTop ? 'Top' : `Frame ${frame.target.frameId}`}
                      </span>
                    </div>
                    <Show when={frame.error}>{(message) => <p class="frame-error">{message()}</p>}</Show>
                    <For each={frame.snapshot?.canvases ?? []}>
                      {(canvas) => (
                        <button
                          class={['canvas-row', { selected: isSelected(frame.target, canvas) }]}
                          aria-pressed={isSelected(frame.target, canvas) ? 'true' : 'false'}
                          type="button"
                          onClick={() => selectCanvas(frame.target, canvas)}
                        >
                          <span class={['canvas-preview', { 'is-hidden': !canvas.visible }]} aria-hidden="true" />
                          <span class="canvas-copy">
                            <strong>{canvas.label}</strong>
                            <small>
                              {canvas.width} × {canvas.height} · {canvas.context}
                            </small>
                          </span>
                        </button>
                      )}
                    </For>
                  </section>
                )}
              </For>
            </Show>
          </aside>

          <section class="canvas-detail">
            <Show
              when={selectedCanvas()}
              fallback={
                <div class="detail-empty">
                  <span class="empty-graphic" aria-hidden="true" />
                  <h2>Select a canvas</h2>
                  <p>Canvas elements from the top page and cross-origin frames appear in the sidebar.</p>
                </div>
              }
            >
              {(canvas) => (
                <>
                  <div class="detail-title-row">
                    <div>
                      <p class="eyebrow">Selected canvas</p>
                      <h2>{canvas().label}</h2>
                      <p class="frame-url">{selectedFrame()?.snapshot?.documentUrl}</p>
                    </div>
                    <span class={['context-badge', { observed: canvas().context !== 'Not observed' }]}>
                      {canvas().context}
                    </span>
                  </div>

                  <dl class="metrics">
                    <div>
                      <dt>Drawing buffer</dt>
                      <dd>
                        {canvas().width} × {canvas().height}
                      </dd>
                    </div>
                    <div>
                      <dt>CSS size</dt>
                      <dd>
                        {canvas().clientWidth} × {canvas().clientHeight}
                      </dd>
                    </div>
                    <div>
                      <dt>Visible</dt>
                      <dd>{canvas().visible ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt>Frame</dt>
                      <dd>{selectedFrame()?.target.isTop ? 'Top' : 'Embedded'}</dd>
                    </div>
                  </dl>

                  <div class="capture-card">
                    <div>
                      <h3>Capture WebGL activity</h3>
                      <p>
                        Wait for the next WebGL render, or record a fixed number of calls on an already-running page.
                      </p>
                    </div>
                    <div class="capture-actions">
                      <Show
                        when={!activeCapture()}
                        fallback={
                          activeCapture()?.snapshot?.status.type === 'processing' ? (
                            <button class="button" type="button" disabled>
                              Processing…
                            </button>
                          ) : (
                            <button class="button danger" type="button" onClick={() => void stopCapture()}>
                              {activeCapture()?.snapshot?.status.type === 'waiting'
                                ? 'Cancel waiting'
                                : 'Cancel capture'}
                            </button>
                          )
                        }
                      >
                        <button
                          class="button primary"
                          type="button"
                          disabled={capturePending()}
                          onClick={() => void capture(0)}
                        >
                          Capture next frame
                        </button>
                        <button
                          class="button"
                          type="button"
                          disabled={capturePending()}
                          onClick={() => void capture(500)}
                        >
                          Capture 500 calls
                        </button>
                      </Show>
                    </div>
                  </div>
                </>
              )}
            </Show>
          </section>
        </div>
      </Show>
    </main>
  );
}

const SpectorResultView = lazy(() => import('@app-game/spector/solid/result-view'), { export: 'SpectorResultView' });

function frameHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol;
  } catch {
    return url;
  }
}
