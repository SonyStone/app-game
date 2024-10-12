export default function SVGEditorApp() {
  return (
    <div id="MainScene">
      <div id="PanelContainer" class="min-w-360px">
        <div class="flex">
          <div id="MainContainer">
            <CodeEditor />
            <Inspector />
          </div>
          <Display />
        </div>
      </div>
    </div>
  );
}

function CodeEditor() {
  return (
    <div id="CodeEditor">
      <div id="CodeButtons"></div>
      <div id="ScriptEditor"></div>
    </div>
  );
}

function Inspector() {
  return (
    <div id="Inspector">
      <div id="InspectorContainer"></div>
    </div>
  );
}

function Display() {
  return (
    <div id="Display">
      <div id="ToolbarContainer"></div>
    </div>
  );
}
