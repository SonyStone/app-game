import { createRoot, sharedConfig } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createSpread } from './spread';

/** Real SSR hydration is covered in tests/browser-entry.ts; these isolate queue races. */
describe('deferred hydration application', () => {
  it('uses the latest props queued during a claim', async () => {
    const element = document.createElement('div');
    const root = createRoot((dispose) => ({ update: createSpread(element), dispose }));
    const wasHydrating = sharedConfig.hydrating;
    try {
      sharedConfig.hydrating = true;
      root.update({ title: 'first' });
      root.update({ title: 'latest' });
      expect(element.hasAttribute('title')).toBe(false);
    } finally {
      sharedConfig.hydrating = wasHydrating;
    }
    await Promise.resolve();
    expect(element.title).toBe('latest');
    root.dispose();
    expect(element.hasAttribute('title')).toBe(false);
  });

  it('does not replay an old target after a synchronous update supersedes the queue', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    let target = first;
    const root = createRoot((dispose) => ({ update: createSpread(() => target), dispose }));
    const wasHydrating = sharedConfig.hydrating;
    try {
      sharedConfig.hydrating = true;
      root.update({ title: 'old' });
    } finally {
      sharedConfig.hydrating = wasHydrating;
    }
    target = second;
    root.update({ title: 'new' });
    await Promise.resolve();
    expect(first.hasAttribute('title')).toBe(false);
    expect(second.title).toBe('new');
    root.dispose();
  });
});
