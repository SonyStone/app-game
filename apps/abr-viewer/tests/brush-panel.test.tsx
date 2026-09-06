// @vitest-environment happy-dom
import { AbrParser } from '@app-game/abr-parser/browser';
import { render } from '@solidjs/web';
import { readFileSync } from 'node:fs';
import { createRoot, runWithOwner, flush as solidFlush } from 'solid-js';
import { expect, test, vi } from 'vitest';
import { BrushPanel } from '../src/components/BrushPanel';
import { brushToFormValues, formValuesToBrush } from '../src/features/brush-detail/brush-form-schema';
import { allBrushNodes } from '../src/lib/brush-tree';
import { createWorkspace } from '../src/lib/workspace';

const previews = vi.hoisted(() => ({ mounted: vi.fn(), disposed: vi.fn(), updated: vi.fn() }));

// Keep the real tree and reactive preset components, substituting only the GPU presentation boundary.
vi.mock('../src/features/brush-detail/components/panel-components/BrushPreviewCanvas', async () => {
  const { createEffect, onCleanup } = await import('solid-js');
  return {
    BrushPreviewCanvas(props: { brush: { id: string }; values: { spacing: number } }) {
      const id = props.brush.id;
      previews.mounted(id);
      onCleanup(() => previews.disposed(id));
      createEffect(
        () => props.values.spacing,
        (spacing) => previews.updated(id, spacing)
      );
      return <canvas data-preview-brush={id} />;
    }
  };
});

/** Publishes edits like a user event, outside the render owner. */
function flush(action: () => void) {
  runWithOwner(null, () => solidFlush(action));
}

test('spacing edits and undo preserve every preset canvas and update only the edited preview', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  let cleanupWorkspace!: () => void;
  const workspace = createRoot((dispose) => {
    cleanupWorkspace = dispose;
    return createWorkspace();
  });
  const file = new AbrParser().parse(
    readFileSync(`${import.meta.dirname}/../../../packages/abr-parser/files/Basic_3.abr`)
  );
  flush(() => workspace.importFiles([{ ...file, fileName: 'Basic_3.abr' }]));
  const nodes = allBrushNodes(workspace.root().children);
  const initial = nodes[0].brush;
  const dispose = render(() => <BrushPanel workspace={workspace} onImport={() => {}} onExport={() => {}} />, host);
  try {
    await vi.waitFor(() => expect(host.querySelectorAll('canvas')).toHaveLength(3));
    const canvases = [...host.querySelectorAll('canvas')];
    expect(previews.mounted).toHaveBeenCalledTimes(3);
    previews.updated.mockClear();
    for (const spacing of [58, 75, 100]) {
      const values = brushToFormValues(workspace.active()!.brush);
      values.spacing = spacing;
      flush(() => workspace.updateBrush(nodes[0].id, formValuesToBrush(workspace.active()!.brush, values)));
      await vi.waitFor(() => expect(previews.updated).toHaveBeenLastCalledWith(initial.id, spacing));
      expect([...host.querySelectorAll('canvas')]).toEqual(canvases);
    }
    expect(previews.mounted).toHaveBeenCalledTimes(3);
    expect(previews.disposed).not.toHaveBeenCalled();
    expect(previews.updated.mock.calls.every(([id]) => id === initial.id)).toBe(true);
    expect(initial.spacing).toBe(10);
    flush(workspace.undo);
    await vi.waitFor(() => expect(previews.updated).toHaveBeenLastCalledWith(initial.id, 75));
    expect([...host.querySelectorAll('canvas')]).toEqual(canvases);
    flush(workspace.redo);
    await vi.waitFor(() => expect(previews.updated).toHaveBeenLastCalledWith(initial.id, 100));
    expect([...host.querySelectorAll('canvas')]).toEqual(canvases);
  } finally {
    dispose();
    cleanupWorkspace();
    host.remove();
  }
});
