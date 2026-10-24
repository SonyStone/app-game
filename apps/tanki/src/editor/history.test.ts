import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '../map/format';
import { addItem, moveItems } from './edits';
import { record, redo, startHistory, undo } from './history';

describe('history', () => {
  it('undoes and redoes recorded steps in order', () => {
    let history = startHistory('a');
    history = record(history, 'b');
    history = record(history, 'c');

    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    history = redo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
  });

  it('does nothing past either end', () => {
    const start = startHistory(1);

    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
  });

  it('drops the redo branch when a new step is recorded after an undo', () => {
    let history = record(record(startHistory('a'), 'b'), 'c');
    history = record(undo(history), 'd');

    expect(history.future).toEqual([]);
    expect(undo(history).present).toBe('b');
  });

  it('ignores recording the present again', () => {
    const history = record(startHistory('a'), 'b');

    expect(record(history, 'b')).toBe(history);
  });

  it('forgets the oldest steps past the limit', () => {
    let history = startHistory(0);

    for (let step = 1; step <= 10; step++) {
      history = record(history, step, 3);
    }

    expect(history.past).toEqual([7, 8, 9]);
  });

  it('restores whole maps, sharing untouched objects', () => {
    const empty = createEmptyMap('Test', 100, 100);
    const withCrate = addItem(empty, { id: 'c', kind: 'crate', x: 10, y: 10, size: { x: 4, y: 8 }, rotation: 0 });
    const moved = moveItems(withCrate, ['c'], { x: 5, y: 0 });
    let history = record(record(startHistory(empty), withCrate), moved);

    history = undo(history);
    expect(history.present).toBe(withCrate);
    expect(history.present.objects[0]).toMatchObject({ x: 10 });
    history = undo(history);
    expect(history.present.objects).toEqual([]);
    history = redo(redo(history));
    expect(history.present.objects[0]).toMatchObject({ x: 15 });
  });
});
