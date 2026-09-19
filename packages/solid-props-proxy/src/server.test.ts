import { isServer } from '@solidjs/web';
import { createRoot } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createPropsProxy } from './component';
import { createSpread } from './spread';

it('is inert under actual Solid server exports without reading DOM accessors', () => {
  expect(isServer).toBe(true);
  const target = vi.fn((): HTMLInputElement => {
    throw new Error('DOM accessor evaluated on server');
  });
  const props = {
    get value(): string {
      throw new Error('DOM props evaluated on server');
    }
  };
  createRoot((dispose) => {
    createPropsProxy(target, props);
    const spread = createSpread(target);
    spread(props);
    dispose();
    spread(props);
  });
  expect(target).not.toHaveBeenCalled();
});
