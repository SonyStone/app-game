import './editor/fonts.module.css';

import { Show } from 'solid-js';
import { createEditorAppController } from './features/shell/createEditorAppController';

import { TopBar } from './features/chrome/TopBar';
import { SvgDropOverlay } from './features/import/SvgDropOverlay';
import { EditorModalStack } from './features/modals/EditorModalStack';
import { EditorSidebar } from './features/panels/EditorSidebar';
import { EditorContextMenu } from './features/selection/EditorContextMenu';
import { EditorFileInputs } from './features/shell/EditorFileInputs';
import { EditorViewport } from './features/viewport/EditorViewport';

export function App() {
  const app = createEditorAppController();
  return (
    <div
      ref={app.root.setAppRootRef}
      class={app.root.className()}
      style={app.root.themeVars()}
      data-testid="solid-svg-editor"
      onDragEnter={app.root.onDragEnter}
      onDragOver={app.root.onDragOver}
      onDragLeave={app.root.onDragLeave}
      onDrop={(event) => void app.root.onDrop(event)}
    >
      <EditorFileInputs
        setImportInputRef={app.fileInputs.setImportInputRef}
        onImportFile={(event) => void app.fileInputs.onImportFile(event)}
        setReferenceInputRef={app.fileInputs.setReferenceInputRef}
        onReferenceFile={app.fileInputs.onReferenceFile}
      />
      <TopBar
        activeTab={app.topBar.activeTab()}
        tabs={app.topBar.tabs()}
        fileSize={app.topBar.fileSize()}
        canUndo={app.topBar.canUndo()}
        canRedo={app.topBar.canRedo()}
        setActiveTabId={app.topBar.setActiveTabId}
        activeTabId={app.topBar.activeTabId()}
        closeTab={app.topBar.closeTab}
        createNewTab={app.topBar.createNewTab}
        openImportDialog={app.topBar.openImportDialog}
        downloadSvg={app.topBar.downloadSvg}
        copySvgText={() => void app.topBar.copySvgText()}
        undo={app.topBar.undo}
        redo={app.topBar.redo}
        optimizeActive={app.topBar.optimizeActive}
        openExport={app.topBar.openExport}
        openSettings={app.topBar.openSettings}
        openAbout={app.topBar.openAbout}
        openDonate={app.topBar.openDonate}
        openShortcuts={app.topBar.openShortcuts}
      />

      <div
        class="workspace grid min-h-0 grid-cols-[auto_8px_minmax(0,1fr)] bg-[var(--base)] [@media(max-width:820px)]:grid-rows-[minmax(320px,44%)_8px_minmax(0,1fr)]"
        data-testid="editor-workspace"
      >
        <EditorSidebar
          width={app.workspace.sidebar.width()}
          activePanel={app.workspace.activePanel()}
          setActivePanel={app.workspace.setActivePanel}
          root={app.workspace.activeRoot()}
          selectedIds={app.workspace.selectedIds()}
          selectedPathCommand={app.workspace.selectedPathCommand()}
          setSelectedPathCommand={app.workspace.setSelectedPathCommand}
          selectNode={app.workspace.selectNode}
          clearSelection={app.workspace.clearSelection}
          addElement={app.workspace.addElement}
          addTextNode={app.workspace.addTextNode}
          updateElementAttribute={app.workspace.updateElementAttribute}
          removeElementAttribute={app.workspace.removeElementAttribute}
          updateBasicNodeText={app.workspace.updateBasicNodeText}
          openContextMenu={app.workspace.openContextMenu}
          reorderNodes={app.workspace.reorderInspectorNodes}
          code={app.workspace.activeCode()}
          parseError={app.workspace.parseError()}
          applyCode={app.workspace.applyCode}
          reformatPretty={app.workspace.reformatPretty}
          reformatCompact={app.workspace.reformatCompact}
          copySvgText={() => void app.topBar.copySvgText()}
          selectedNodes={app.workspace.selectedNodes()}
          elementCount={app.workspace.elementCount()}
          exportText={app.workspace.exportText()}
          heldKeys={app.workspace.heldKeys()}
          viewportPointer={app.workspace.viewportPointer()}
          recentCommandEvent={app.workspace.recentCommandEvent()}
        />
        <button
          class="splitter w-2 cursor-col-resize border-0 bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] [@media(max-width:820px)]:h-2 [@media(max-width:820px)]:cursor-row-resize"
          type="button"
          aria-label="Resize sidebar"
          data-testid="workspace-splitter"
          onPointerDown={app.workspace.sidebar.onPointerDown}
          onPointerMove={app.workspace.sidebar.onPointerMove}
          onPointerUp={app.workspace.sidebar.onPointerUp}
        />
        <EditorViewport
          settings={app.viewport.settings()}
          setSettings={app.viewport.setSettings}
          zoom={app.viewport.zoom()}
          zoomBy={app.viewport.zoomBy}
          centerFrame={app.viewport.centerFrame}
          isFullscreen={app.viewport.isFullscreen()}
          toggleFullscreen={app.viewport.toggleFullscreen}
          openReferenceDialog={app.viewport.openReferenceDialog}
          referenceImage={app.viewport.referenceImage()}
          showReference={app.viewport.showReference()}
          setShowReference={app.viewport.setShowReference}
          overlayReference={app.viewport.overlayReference()}
          setOverlayReference={app.viewport.setOverlayReference}
          clearReference={app.viewport.clearReference}
          setDragSelectionMode={app.viewport.setDragSelectionMode}
          setViewportShell={app.viewport.setViewportShell}
          setCanvasSvg={app.viewport.setCanvasSvg}
          viewRect={app.viewport.viewRect()}
          viewportTransform={app.viewport.viewportTransform()}
          gridViewRect={app.viewport.gridViewRect()}
          rootSize={app.viewport.rootSize()}
          root={app.viewport.activeRoot()}
          selectedIds={app.viewport.selectedIds()}
          viewportIsMoving={app.viewport.viewportIsMoving()}
          useRasterPreview={app.viewport.useRasterPreview()}
          rasterPreviewUrl={app.viewport.rasterPreviewUrl()}
          rasterPreviewRect={app.viewport.rasterPreviewRect()}
          handles={app.viewport.handles()}
          selectionBox={app.viewport.selectionBox()}
          marqueeRect={app.viewport.marqueeRect()}
          onCanvasWheel={app.viewport.onCanvasWheel}
          onCanvasPointerDown={app.viewport.onCanvasPointerDown}
          onNodePointerDown={app.viewport.onNodePointerDown}
          openContextMenu={app.workspace.openContextMenu}
          startHandleDrag={app.viewport.startHandleDrag}
          startTransformBoxDrag={app.viewport.startTransformBoxDrag}
        />
      </div>

      <Show when={app.contextMenu.state()}>
        {(menu) => <EditorContextMenu menu={menu()} runAction={app.contextMenu.runAction} />}
      </Show>

      <EditorModalStack
        modal={app.modals.modal()}
        settings={app.modals.settings()}
        setSettings={app.modals.setSettings}
        root={app.modals.activeRoot()}
        exportText={app.modals.exportText()}
        close={app.modals.close}
        reformatActiveCode={app.modals.reformatActiveCode}
      />
      <Show when={app.dropOverlay.active()}>
        <SvgDropOverlay />
      </Show>
    </div>
  );
}

export default App;
