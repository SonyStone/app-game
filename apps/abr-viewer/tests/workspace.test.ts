import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { composeAbr, pixels } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { createRoot, runWithOwner, flush as solidFlush } from 'solid-js';
import { describe, expect, test } from 'vitest';
import { brushToFormValues, formValuesToBrush } from '../src/features/brush-detail/brush-form-schema';
import { allBrushNodes, type GroupNode } from '../src/lib/brush-tree';
import { createWorkspace } from '../src/lib/workspace';
import './initAbr';

/** Loads a real fixture, preserving its format resources. */
function sample(name = 'Basic_3') {
  const file = loadBrushLibrary(
    readFileSync(new URL(`../../../packages/abr-parser/files/${name}.abr`, import.meta.url))
  );
  file.brushes.forEach((brush, index) => {
    brush.id = `${name}-${index}`;
  });
  return { ...file, fileName: name };
}

/** Exercises the same binary export path used by the browser. */
function roundtrip(file: ReturnType<ReturnType<typeof createWorkspace>['exportFile']>) {
  return loadBrushLibrary(composeAbr(file));
}

/** Simulates a user event outside component initialization, then publishes its writes. */
function flush(action: () => void) {
  return runWithOwner(null, () => solidFlush(action));
}

describe('brush workspace', () => {
  test('live settings survive switching, undo/redo, and binary export', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      flush(() => workspace.importFiles([sample()]));
      const node = workspace.active()!;
      const values = brushToFormValues(node.brush);
      Object.assign(values, {
        name: 'Edited soft round',
        diameter: 80,
        spacing: 17,
        angle: 25,
        hardness: 40,
        flipX: true
      });
      values.shapeDynamics.minimumDiameter = 12;
      flush(() => workspace.updateBrush(node.id, formValuesToBrush(node.brush, values)));
      const parsed = roundtrip(workspace.exportFile('all'));
      expect(parsed.errors).toEqual([]);
      const edited = parsed.brushes[0];
      expect(edited.preset).toMatchObject({
        name: values.name,
        tip: { diameter: 80, spacing: 17, angle: 25, hardness: 40 }
      });
      expect(brushToFormValues(edited).flipX).toBe(true);
      expect(brushToFormValues(edited).shapeDynamics.minimumDiameter).toBe(12);
      flush(workspace.undo);
      expect(workspace.active()!.brush.preset.tip?.diameter).toBe(40);
      flush(workspace.redo);
      expect(workspace.active()!.brush.preset.tip?.diameter).toBe(80);
      dispose();
    }));

  test('reorder and export keep nested groups, brush order, and sampled tips', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      flush(() => workspace.importFiles([sample(), sample('Chunky_Chalk_Brush_by_MarkWinters')]));
      const group = workspace.root().children[0] as GroupNode;
      const moved = allBrushNodes(group.children)[1];
      flush(() => workspace.addGroup(group.id));
      const folderId = workspace.selection()[0];
      flush(() => workspace.reorder({ keys: [moved.id], place: { parent: folderId, before: null } }));
      const parsed = roundtrip(workspace.exportFile('all'));
      expect(parsed.errors).toEqual([]);
      expect(parsed.brushes.map((brush) => brush.name)).toEqual([
        'Soft Round 40',
        'Hard Round 35',
        'Hard Flat 40',
        'Chalk 36 pixels 1'
      ]);
      expect(parsed.hierarchy?.filter((item) => item.kind === 'group').map((item) => item.name)).toEqual([
        'Basic_3',
        'New Group',
        'Chunky_Chalk_Brush_by_MarkWinters'
      ]);
      expect(parsed.brushes.at(-1)?.tipImage?.data).toEqual(
        sample('Chunky_Chalk_Brush_by_MarkWinters').brushes[0].tipImage?.data
      );
      dispose();
    }));

  test('selection exports entire groups and preserves ancestors of selected leaves', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      flush(() => workspace.importFiles([sample()]));
      const group = workspace.root().children[0] as GroupNode;
      flush(() => workspace.setSelection([group.id]));
      expect(roundtrip(workspace.exportFile('selection')).brushes).toHaveLength(3);
      flush(() => workspace.setSelection([group.children[1].id]));
      const parsed = roundtrip(workspace.exportFile('selection'));
      expect(parsed.brushes.map((brush) => brush.name)).toEqual(['Hard Flat 40']);
      expect(parsed.hierarchy?.find((item) => item.kind === 'group')?.name).toBe('Basic_3');
      dispose();
    }));

  test('duplicate and delete are undoable without modifying the original', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      flush(() => workspace.importFiles([sample()]));
      const original = workspace.active()!;
      flush(workspace.duplicate);
      const brushes = allBrushNodes(workspace.root().children);
      expect(brushes.map((node) => node.name)).toEqual([
        'Soft Round 40',
        'Soft Round 40 copy',
        'Hard Flat 40',
        'Hard Round 35'
      ]);
      expect(brushes[1].brush.id).not.toBe(original.brush.id);
      expect(roundtrip(workspace.exportFile('all')).brushes[1].name).toBe('Soft Round 40 copy');
      flush(() => workspace.remove([original.id]));
      expect(allBrushNodes(workspace.root().children)).toHaveLength(3);
      flush(workspace.undo);
      expect(allBrushNodes(workspace.root().children)).toHaveLength(4);
      expect(original.name).toBe('Soft Round 40');
      dispose();
    }));

  test('keeps import errors visible to the export guard', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      const partial = sample();
      partial.errors = [...partial.errors, 'Unsupported descriptor type in another record'];
      flush(() => workspace.importFiles([partial]));
      expect(() => roundtrip(workspace.exportFile('all'))).toThrow('incompletely parsed');
      dispose();
    }));

  test('refuses moving a group inside its own descendants', () =>
    createRoot((dispose) => {
      const workspace = createWorkspace();
      flush(() => workspace.importFiles([sample()]));
      const group = workspace.root().children[0] as GroupNode;
      flush(() => workspace.addGroup(group.id));
      const root = workspace.root();
      flush(() => workspace.reorder({ keys: [group.id], place: { parent: workspace.selection()[0], before: null } }));
      expect(workspace.root()).toBe(root);
      dispose();
    }));
});

test('a stored workspace preserves edits, removal and export resources across reloads', () =>
  createRoot((dispose) => {
    const original = createWorkspace();
    flush(() => original.importFiles([sample()]));
    const first = original.active()!;
    flush(() =>
      original.updateBrush(first.id, {
        ...first.brush,
        name: 'Saved pencil',
        preset: {
          ...first.brush.preset,
          name: 'Saved pencil',
          tip: { ...first.brush.preset.tip!, diameter: pixels(73) }
        }
      })
    );
    const checkpoint = structuredClone(original.snapshot());
    const restored = createWorkspace();
    flush(() => restored.restore(checkpoint));
    expect(restored.active()?.brush.name).toBe('Saved pencil');
    expect(restored.active()?.brush.preset.tip?.diameter).toBe(73);
    expect(restored.exportFile('all')).toEqual(original.exportFile('all'));
    expect(restored.canUndo()).toBe(false);
    flush(() => restored.remove([restored.root().children[0]!.id]));
    const empty = createWorkspace();
    flush(() => empty.restore(structuredClone(restored.snapshot())));
    expect(empty.root().children).toHaveLength(0);
    dispose();
  }));
