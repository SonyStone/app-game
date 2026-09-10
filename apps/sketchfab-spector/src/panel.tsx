import { For, Loading, Show, lazy } from 'solid-js';
import type { createInspectorSession } from './inspector-session';
import styles from './panel.module.css';

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
    <main class={styles.panelShell}>
      <Show
        when={!showResults()}
        fallback={
          <section class={styles.resultShell}>
            <Loading
              fallback={
                <p class={styles.emptyMessage} role="status">
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
        <header class={styles.panelHeader}>
          <div class={styles.brand}>
            <span class={styles.brandMark} aria-hidden="true" />
            <div>
              <h1>WebGL Spector</h1>
              <p>
                {canvasCount()} canvases across {frames().length} frames
              </p>
            </div>
          </div>
          <div class={styles.headerActions}>
            <Show when={captures().length > 0}>
              <button class={`${styles.button} ${styles.quiet}`} type="button" onClick={() => openResults()}>
                Captures ({captures().length})
              </button>
            </Show>
            <button
              class={`${styles.button} ${styles.quiet}`}
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing()}
            >
              Refresh
            </button>
          </div>
        </header>

        <Show when={busyMessage()}>
          <div class={`${styles.notice} ${styles.progress}`} role="status">
            <span class={styles.activitySpinner} aria-hidden="true" />
            <span>{busyMessage()}</span>
          </div>
        </Show>
        <Show when={errorMessage()}>
          {(message) => (
            <div class={`${styles.notice} ${styles.error}`} role="alert">
              {message()}
            </div>
          )}
        </Show>

        <div class={styles.workspace}>
          <aside class={styles.canvasBrowser}>
            <div class={styles.sectionHeading}>
              <span>Page canvases</span>
              <span class={styles.count}>{canvasCount()}</span>
            </div>
            <Show
              when={frames().length > 0}
              fallback={
                <p class={styles.emptyMessage}>No canvas elements found in the inspected page or its frames.</p>
              }
            >
              <For each={frames()}>
                {(frame) => (
                  <section class={styles.frameGroup}>
                    <div class={styles.frameHeading} title={frame.target.url}>
                      <span>{frame.snapshot?.documentTitle || frameHost(frame.target.url)}</span>
                      <span class={styles.duplicateBadge}>
                        {frame.target.isTop ? 'Top' : `Frame ${frame.target.frameId}`}
                      </span>
                    </div>
                    <Show when={frame.error}>{(message) => <p class={styles.frameError}>{message()}</p>}</Show>
                    <For each={frame.snapshot?.canvases ?? []}>
                      {(canvas) => (
                        <button
                          class={[styles.canvasRow, { [styles.selected]: isSelected(frame.target, canvas) }]}
                          aria-pressed={isSelected(frame.target, canvas) ? 'true' : 'false'}
                          type="button"
                          onClick={() => selectCanvas(frame.target, canvas)}
                        >
                          <span
                            class={[styles.canvasPreview, { [styles.isHidden]: !canvas.visible }]}
                            aria-hidden="true"
                          />
                          <span class={styles.canvasCopy}>
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

          <section class={styles.canvasDetail}>
            <Show
              when={selectedCanvas()}
              fallback={
                <div class={styles.detailEmpty}>
                  <span class={styles.emptyGraphic} aria-hidden="true" />
                  <h2>Select a canvas</h2>
                  <p>Canvas elements from the top page and cross-origin frames appear in the sidebar.</p>
                </div>
              }
            >
              {(canvas) => (
                <>
                  <div class={styles.detailTitleRow}>
                    <div>
                      <p class={styles.eyebrow}>Selected canvas</p>
                      <h2>{canvas().label}</h2>
                      <p class={styles.frameUrl}>{selectedFrame()?.snapshot?.documentUrl}</p>
                    </div>
                    <span
                      class={[styles.contextBadge, { [styles.observed]: canvas().context !== 'Not observed' }]}
                    >
                      {canvas().context}
                    </span>
                  </div>

                  <dl class={styles.metrics}>
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

                  <div class={styles.captureCard}>
                    <div>
                      <h3>Capture WebGL activity</h3>
                      <p>
                        Wait for the next WebGL render, or record a fixed number of calls on an already-running page.
                      </p>
                    </div>
                    <div class={styles.captureActions}>
                      <Show
                        when={!activeCapture()}
                        fallback={
                          activeCapture()?.snapshot?.status.type === 'processing' ? (
                            <button class={styles.button} type="button" disabled>
                              Processing…
                            </button>
                          ) : (
                            <button
                              class={`${styles.button} ${styles.danger}`}
                              type="button"
                              onClick={() => void stopCapture()}
                            >
                              {activeCapture()?.snapshot?.status.type === 'waiting'
                                ? 'Cancel waiting'
                                : 'Cancel capture'}
                            </button>
                          )
                        }
                      >
                        <button
                          class={`${styles.button} ${styles.primary}`}
                          type="button"
                          disabled={capturePending()}
                          onClick={() => void capture(0)}
                        >
                          Capture next frame
                        </button>
                        <button
                          class={styles.button}
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
