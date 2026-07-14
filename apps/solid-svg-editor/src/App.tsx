import './editor/fonts.module.css';

import { createEditorAppController } from './features/shell/createEditorAppController';

import { TopBar } from './features/chrome/TopBar';
import { SvgDropOverlay } from './features/import/SvgDropOverlay';
import { EditorModalStack } from './features/modals/EditorModalStack';
import { EditorSidebar, WorkspaceSplitter } from './features/panels/EditorSidebar';
import { EditorContextMenu } from './features/selection/EditorContextMenu';
import { EditorFileInputs } from './features/shell/EditorFileInputs';
import { EditorViewport } from './features/viewport/EditorViewport';

export function App() {
  const app = createEditorAppController();
  const appHost = () => app.kernel.ui.appHost;
  const svgImport = () => app.kernel.ui.svgImport;

  return (
    <div
      ref={(element) => appHost()?.setRootRef(element)}
      class={appHost()?.className() ?? ''}
      style={appHost()?.themeVars()}
      data-testid="solid-svg-editor"
      onDragEnter={(event) => svgImport()?.onDragEnter(event)}
      onDragOver={(event) => svgImport()?.onDragOver(event)}
      onDragLeave={(event) => svgImport()?.onDragLeave(event)}
      onDrop={(event) => void svgImport()?.onDrop(event)}
    >
      <EditorFileInputs kernel={app.kernel} />
      <TopBar kernel={app.kernel} />

      <div
        class="workspace grid min-h-0 grid-cols-[auto_8px_minmax(0,1fr)] bg-[var(--base)] [@media(max-width:820px)]:grid-rows-[minmax(320px,44%)_8px_minmax(0,1fr)]"
        data-testid="editor-workspace"
      >
        <EditorSidebar kernel={app.kernel} />
        <WorkspaceSplitter kernel={app.kernel} />
        <EditorViewport kernel={app.kernel} />
      </div>

      <EditorContextMenu kernel={app.kernel} />

      <EditorModalStack kernel={app.kernel} />
      <SvgDropOverlay kernel={app.kernel} />
    </div>
  );
}

export default App;
