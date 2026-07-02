import { pathCommandLetters } from '../../path-data';

export function createEditorShortcuts(options: {
  readonly redo: () => void;
  readonly undo: () => void;
  readonly downloadSvg: () => void;
  readonly openImportDialog: () => void;
  readonly openExport: () => void;
  readonly createNewTab: () => void;
  readonly openSettings: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly centerFrame: () => void;
  readonly toggleGrid: () => void;
  readonly toggleHandles: () => void;
  readonly selectAll: () => void;
  readonly duplicateSelected: () => void;
  readonly deleteSelected: () => void;
  readonly moveSelected: (direction: -1 | 1) => void;
  readonly insertPathCommandFromKey: (key: string, absolute: boolean) => void;
}) {
  const pathCommandKeys = pathCommandLetters.map((letter) => letter.toLowerCase());

  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const editing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
    const control = event.ctrlKey || event.metaKey;

    if (control && event.key.toLowerCase() === 'z' && event.shiftKey) {
      event.preventDefault();
      options.redo();
      return;
    }

    if (control && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      options.undo();
      return;
    }

    if (control && event.key.toLowerCase() === 's') {
      event.preventDefault();
      options.downloadSvg();
      return;
    }

    if (control && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      options.openImportDialog();
      return;
    }

    if (control && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      options.openExport();
      return;
    }

    if (control && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      options.createNewTab();
      return;
    }

    if (control && event.key === ',') {
      event.preventDefault();
      options.openSettings();
      return;
    }

    if (control && event.key === '=') {
      event.preventDefault();
      options.zoomIn();
      return;
    }

    if (control && event.key === '-') {
      event.preventDefault();
      options.zoomOut();
      return;
    }

    if (control && event.key === '0') {
      event.preventDefault();
      options.centerFrame();
      return;
    }

    if (control && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      options.toggleGrid();
      return;
    }

    if (control && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      options.toggleHandles();
      return;
    }

    if (editing) {
      return;
    }

    if (control && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      options.selectAll();
      return;
    }

    if (control && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      options.duplicateSelected();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      options.deleteSelected();
      return;
    }

    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      options.moveSelected(-1);
      return;
    }

    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      options.moveSelected(1);
      return;
    }

    if (pathCommandKeys.includes(event.key.toLowerCase())) {
      options.insertPathCommandFromKey(event.key, event.shiftKey);
    }
  }

  return { onKeyDown };
}
