import { createRoot, flush } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createDocumentDrop } from './createDocumentDrop';

describe('local document drop', () => {
  it('tracks nested enter/leave, ignores text and detaches listeners on disposal', () => {
    let dispose!: () => void;
    const open = vi.fn();
    const drop = createRoot((stop) => {
      dispose = stop;
      return createDocumentDrop(open);
    });
    const target = document.createElement('div');
    const child = target.appendChild(document.createElement('button'));
    drop.ref(target);
    flush();
    dispatch(target, 'dragenter', [], ['text/plain']);
    expect(drop.isOver()).toBe(false);
    dispatch(target, 'dragleave', [], ['text/plain']);
    dispatch(target, 'dragenter');
    dispatch(child, 'dragenter');
    flush();
    expect(drop.isOver()).toBe(true);
    dispatch(child, 'dragleave');
    flush();
    expect(drop.isOver()).toBe(true);
    dispatch(target, 'dragleave');
    flush();
    expect(drop.isOver()).toBe(false);
    dispose();
    expect(dispatch(target, 'drop', [new File(['pdf'], 'file.pdf')]).defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('ignores text drops, creates no preview URLs and replaces its target', () => {
    let dispose!: () => void;
    const open = vi.fn();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    const drop = createRoot((stop) => {
      dispose = stop;
      return createDocumentDrop(open);
    });
    const oldTarget = document.createElement('div');
    const target = document.createElement('div');
    try {
      drop.ref(oldTarget);
      drop.ref(target);
      flush();
      expect(dispatch(oldTarget, 'drop', [new File(['pdf'], 'old.pdf')]).defaultPrevented).toBe(false);
      dispatch(target, 'dragenter', [], ['text/plain']);
      dispatch(target, 'drop', [], ['text/plain']);
      flush();
      expect(drop.error()).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      const file = new File(['pdf'], 'file.pdf');
      dispatch(target, 'drop', [file]);
      dispatch(target, 'drop', [new File(['text'], 'notes.txt')]);
      dispatch(target, 'drop', [file, file]);
      flush();
      expect(open).toHaveBeenCalledExactlyOnceWith(file);
      expect(createUrl).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    } finally {
      dispose();
      revoke.mockRestore();
      createUrl.mockRestore();
    }
  });

  it('opens PDF/GDOC, blocks browser navigation and rejects unsupported or multiple files', () => {
    let dispose!: () => void;
    const open = vi.fn();
    const drop = createRoot((stop) => {
      dispose = stop;
      return createDocumentDrop(open);
    });
    const target = document.createElement('div');
    drop.ref(target);
    flush();
    try {
      for (const file of [
        new File(['pdf'], 'BOOK.PDF'),
        new File(['gdoc'], 'book.gdoc'),
        new File(['pdf'], 'book', { type: 'application/pdf' })
      ]) {
        dispatch(target, 'dragenter');
        expect(dispatch(target, 'dragover').defaultPrevented).toBe(true);
        expect(dispatch(target, 'drop', [file]).defaultPrevented).toBe(true);
        flush();
        expect(drop.isOver()).toBe(false);
        expect(open).toHaveBeenLastCalledWith(file);
      }
      dispatch(target, 'drop', [new File(['text'], 'notes.txt')]);
      flush();
      expect(drop.error()).toBe('dropUnsupported');
      dispatch(target, 'drop', [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
      flush();
      expect(drop.error()).toBe('dropMultiple');
      expect(open).toHaveBeenCalledTimes(3);
      dispatch(target, 'drop');
      flush();
      expect(drop.error()).toBe('dropUnsupported');
      dispatch(target, 'dragenter');
      flush();
      expect(drop.error()).toBeUndefined();
    } finally {
      dispose();
    }
  });
});

function dispatch(target: HTMLElement, type: string, files: File[] = [], types = ['Files']) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types, dropEffect: 'none' } });
  target.dispatchEvent(event);
  return event;
}
