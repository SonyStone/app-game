import type { ColorMixing } from '@app-game/abr-brush/effects';
import { brushWithResolvedColors } from '@app-game/abr-brush/form';
import { createEffect, createSignal, Show } from 'solid-js';
import { BrushExamplesMenu } from './components/BrushExamplesMenu';
import { BrushPanel } from './components/BrushPanel';
import { BrushDetailEditable } from './features/brush-detail/BrushDetailEditable';
import type { ColorMixingPreference } from './features/brush-detail/color-mixing';
import { ColorProfileContext } from './features/brush-detail/ColorProfile';
import { createColorProfile } from './features/brush-detail/createColorProfile';
import { AbrParser, AbrWriter, brushTipToDataUrl, downloadAbrFile, type AbrFileWithMeta, type Brush } from './lib/abr';
import { fetchBrushExample, type BrushExample } from './lib/brush-examples';
import { allBrushNodes, type GroupNode } from './lib/brush-tree';
import { createWorkspace } from './lib/workspace';
import styles from './App.module.css';

/** Single brush workspace with live settings, undoable organization, and ABR export. */
export function App(
  props: {
    /** Optional embedding action. Reject to report an error while retaining the workspace. */
    onUseBrush?: (brush: Brush) => Promise<void>;
    /** Explains which settings the embedding application can apply. */
    useBrushNote?: string;
    /** Host working space; standalone Viewer defaults to Classic for Photoshop comparison. */
    colorMixing?: ColorMixingPreference;
  } = {}
) {
  const [mixing, setMixing] = createSignal<ColorMixing>('classic');
  const standaloneMixing: ColorMixingPreference = {
    get value() {
      return mixing();
    },
    onChange: setMixing
  };
  const workspace = createWorkspace();
  const colors = createColorProfile();
  const [status, setStatus] = createSignal('Ready');
  createEffect(
    () => colors.profile(),
    (profile) => {
      setStatus(profile ? `CMYK profile: ${profile.name}` : 'Ready');
    }
  );
  const [busy, setBusy] = createSignal(false);
  const [draggingFiles, setDraggingFiles] = createSignal(false);
  const [split, setSplit] = createSignal(45);
  let input!: HTMLInputElement;
  let shell!: HTMLDivElement;
  let dragDepth = 0;
  let applying = false;
  const [usingBrush, setUsingBrush] = createSignal(false, { ownedWrite: true });
  async function useBrush() {
    const brush = workspace.active()?.brush;
    if (!brush || !props.onUseBrush || applying) return;
    applying = true;
    setUsingBrush(true);
    try {
      await props.onUseBrush(brushWithResolvedColors(brush, colors.converter()));
      setStatus(`Selected ${brush.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      applying = false;
      setUsingBrush(false);
    }
  }

  async function importFiles(source: File[] | BrushExample) {
    if (busy()) return;
    setBusy(true);
    setStatus(Array.isArray(source) ? 'Importing brushes…' : `Downloading ${source.name}…`);
    try {
      const files = Array.isArray(source) ? source : [await fetchBrushExample(source)];
      const abrFiles = files.filter((file) => file.name.toLowerCase().endsWith('.abr'));
      if (!abrFiles.length) {
        setStatus('Choose an .abr brush file.');
        return;
      }

      const imported: AbrFileWithMeta[] = [];
      const errors: string[] = [];
      for (const file of abrFiles) {
        try {
          setStatus(`Importing ${file.name.replace(/\.abr$/i, '')}…`);
          const bytes = await file.arrayBuffer();
          await paintImportStatus();
          const parsed: AbrFileWithMeta = new AbrParser().parse(bytes);
          if (!parsed.brushes.length) throw new Error(parsed.errors.join('; ') || 'No brushes found');
          parsed.fileName = file.name.replace(/\.abr$/i, '');
          for (const [index, brush] of parsed.brushes.entries()) {
            if (index % 8 === 0) {
              setStatus(`Preparing brushes ${index + 1} of ${parsed.brushes.length}…`);
              await paintImportStatus();
            }
            brush.id = crypto.randomUUID();
            if (brush.brushTip) Object.assign(brush, { imageDataUrl: brushTipToDataUrl(brush.brushTip) });
          }
          imported.push(parsed);
          if (parsed.errors.length) errors.push(`${file.name}: ${parsed.errors.join('; ')}`);
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Import failed'}`);
        }
      }
      if (imported.length) workspace.importFiles(imported);
      setStatus(
        errors.length
          ? errors.join(' · ')
          : `Imported ${imported.reduce((sum, file) => sum + file.brushes.length, 0)} brushes`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load brushes.');
    } finally {
      setBusy(false);
    }
  }

  function exportBrushes(scope: 'all' | 'selection' | GroupNode) {
    try {
      const file = workspace.exportFile(scope);
      if (!file.brushes.length) {
        setStatus('Select brushes or a group to export.');
        return;
      }
      const name = typeof scope === 'object' ? scope.name : scope === 'all' ? 'Brushes' : 'Selected Brushes';
      downloadAbrFile(new AbrWriter().write(file), `${name.replace(/\.abr$/i, '').replace(/[\\/:*?"<>|]/g, '_')}.abr`);
      if (scope === 'all') workspace.markExported();
      setStatus(`Exported ${file.brushes.length} brushes · ${name}.abr`);
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <ColorProfileContext value={colors}>
      <div
        ref={shell}
        class={`${styles.viewer} ${styles.workspace}`}
        onDragEnter={(event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
            dragDepth++;
            setDraggingFiles(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.dataTransfer?.types.includes('Files') && --dragDepth <= 0) setDraggingFiles(false);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer?.files.length) return;
          event.preventDefault();
          dragDepth = 0;
          setDraggingFiles(false);
          void importFiles(Array.from(event.dataTransfer.files));
        }}
        onKeyDown={(event) => {
          const editing = (event.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]');
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !editing) {
            event.preventDefault();
            event.shiftKey ? workspace.redo() : workspace.undo();
          }
        }}
      >
        <header class={styles.toolbar}>
          <h1>Brush Editor</h1>
          <span class={styles.documentState}>{workspace.dirty() ? 'Modified' : 'Workspace'}</span>
          <div class={styles.toolbarHistory}>
            <button disabled={!workspace.canUndo()} onClick={workspace.undo} title="Undo (⌘Z / Ctrl+Z)">
              Undo
            </button>
            <button disabled={!workspace.canRedo()} onClick={workspace.redo} title="Redo (⇧⌘Z / Ctrl+Shift+Z)">
              Redo
            </button>
          </div>
          <BrushExamplesMenu busy={busy()} loadingMessage={status()} onSelect={importFiles} />
          <button disabled={busy()} onClick={() => input.click()}>
            Import…
          </button>
          <button disabled={!workspace.selection().length} onClick={() => exportBrushes('selection')}>
            Export selected…
          </button>
          <button disabled={!workspace.root().children.length} onClick={() => exportBrushes('all')}>
            Export all…
          </button>
          <input
            ref={input}
            type="file"
            accept=".abr"
            multiple
            hidden
            onChange={(event) => {
              void importFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }}
          />
        </header>
        <Show when={props.onUseBrush}>
          <div class={styles.useBrush}>
            <span>{props.useBrushNote}</span>
            <button disabled={busy() || usingBrush() || !workspace.active()} onClick={() => void useBrush()}>
              {usingBrush() ? 'Preparing brush…' : 'Use in Paint'}
            </button>
          </div>
        </Show>
        <main class={styles.panels} style={{ '--collection-width': `${split()}%` }}>
          <BrushPanel workspace={workspace} onImport={() => input.click()} onExport={exportBrushes} />
          <div
            role="separator"
            aria-label="Panel width"
            aria-orientation="vertical"
            aria-valuemin={30}
            aria-valuemax={60}
            aria-valuenow={split()}
            tabindex="0"
            class={styles.divider}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                setSplit((value) => Math.max(30, Math.min(60, value + (event.key === 'ArrowLeft' ? -2 : 2))));
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                const rect = shell.getBoundingClientRect();
                setSplit(Math.max(30, Math.min(60, ((event.clientX - rect.left) / rect.width) * 100)));
              }
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          />
          <section class={styles.settings} aria-label="Brush Settings">
            <header class={styles.panelHeading}>
              <h2>Brush Settings</h2>
              <span>{workspace.active() ? 'Live preview' : ''}</span>
            </header>
            <Show
              when={workspace.active()}
              fallback={
                <div class={styles.emptySettings}>
                  <p>Select a brush to edit its settings</p>
                  <span>Your collection stays open while you edit.</span>
                </div>
              }
            >
              {(node) => (
                <BrushDetailEditable
                  colorMixing={props.colorMixing ?? standaloneMixing}
                  brushes={allBrushNodes(workspace.root().children).map((node) => node.brush)}
                  brush={node().brush}
                  onChange={(brush) => workspace.updateBrush(node().id, brush)}
                />
              )}
            </Show>
          </section>
        </main>
        <footer class={styles.status} role="status">
          <span>
            <Show when={busy()}>
              <span class={styles.loadingSpinner} aria-hidden="true" />
            </Show>
            {status()}
          </span>
          <span>
            {workspace.selection().length ? `${workspace.selection().length} selected · ` : ''}
            {allBrushNodes(workspace.root().children).length} brushes
          </span>
        </footer>
        <Show when={draggingFiles()}>
          <div class={styles.dropIndicator}>Drop to add brushes</div>
        </Show>
      </div>
    </ColorProfileContext>
  );
}

/** Lets the browser paint import feedback before parsing and between thumbnail batches. */
function paintImportStatus(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
