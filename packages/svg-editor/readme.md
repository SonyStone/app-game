# Legacy SVG editor prototype

This package is a legacy exploration/prototype and should not be used as the shared editor core.
The active foundation is `apps/solid-svg-editor`, which now owns the command system, `SvgDocument`
core, tool/capability/renderer/panel/shortcut registries, and app-local tests.

Keep this package only as a reference for old experiments such as lasso selection, virtual tree
mutation ideas, and path-input sketches. New editor architecture work should move into
`apps/solid-svg-editor` or a future extracted core package based on that app's contracts.

Original note: basically a GodSVG copy
https://github.com/MewPurPur/GodSVG

Need a svg-parser
https://github.com/Rich-Harris/svg-parser

And code editor/highlight
https://highlightjs.org/
https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/codeEditor/codeEditorWidget.ts
https://microsoft.github.io/monaco-editor/monarch.html
https://github.com/codemirror/view/tree/main
https://medv.io/codejar/ -- looks very good

It's look like thay all work the smae way
