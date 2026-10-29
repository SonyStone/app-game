/** @vitest-environment jsdom */
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { expect, it } from 'vitest';
import { StatusArea } from '../src/features/status/StatusArea';

it('presents cached type uncertainty as information, outside approximation lists', () => {
  const host = document.createElement('div');
  const dispose = render(
    () => <StatusArea render={undefined} layerNotes={[]} documentNotes={[]} cachedType onSelect={() => undefined} />,
    host
  );
  try {
    flush();
    expect(host.querySelector('[role="note"]')?.textContent).toContain(
      'Photoshop may blend the edges of some text slightly differently on open.'
    );
    expect(host.querySelector('[aria-label="Approximations"]')).toBeNull();
    expect(host.querySelector('[aria-label="Refused or approximated"]')).toBeNull();
  } finally {
    dispose();
  }
});
