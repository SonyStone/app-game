import { AbrParser, AbrWriter } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { createRoot, runWithOwner, flush as solidFlush } from 'solid-js';
import { describe, expect, test } from 'vitest';
import { brushToFormValues, formValuesToBrush } from '../src/features/brush-detail/brush-form-schema';
import { allBrushNodes, type GroupNode } from '../src/lib/brush-tree';
import { createWorkspace } from '../src/lib/workspace';

/** Loads a real fixture, preserving its format resources. */
function sample(name = 'Basic_3') {
  const file = new AbrParser().parse(
    readFileSync(new URL(`../../../packages/abr-parser/files/${name}.abr`, import.meta.url))
  );
  file.brushes.forEach((brush, index) => {
    brush.id = `${name}-${index}`;
  });
  return { ...file, fileName: name };
}

/** Exercises the same binary export path used by the browser. */
function roundtrip(file: ReturnType<ReturnType<typeof createWorkspace>['exportFile']>) {
  return new AbrParser().parse(new AbrWriter().write(file));
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
      expect(edited).toMatchObject({ name: values.name, diameter: 80, spacing: 17, angle: 25, hardness: 40 });
      expect(brushToFormValues(edited).flipX).toBe(true);
      expect(brushToFormValues(edited).shapeDynamics.minimumDiameter).toBe(12);
      flush(workspace.undo);
      expect(workspace.active()!.brush.diameter).toBe(40);
      flush(workspace.redo);
      expect(workspace.active()!.brush.diameter).toBe(80);
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
      expect(parsed.hierarchy?.filter((item) => item.type === 'group').map((item) => item.name)).toEqual([
        'Basic_3',
        'New Group',
        'Chunky_Chalk_Brush_by_MarkWinters'
      ]);
      expect(parsed.brushes.at(-1)?.brushTip?.data).toEqual(
        sample('Chunky_Chalk_Brush_by_MarkWinters').brushes[0].brushTip?.data
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
      expect(parsed.hierarchy?.find((item) => item.type === 'group')?.name).toBe('Basic_3');
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
      partial.errors.push('Unsupported descriptor type in another record');
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
