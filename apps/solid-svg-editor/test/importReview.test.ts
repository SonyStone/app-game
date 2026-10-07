import { createRoot, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { createImportReview } from '../src/features/import/createImportReview';

const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>';
const unrecognized = (name: string) => `<svg xmlns="http://www.w3.org/2000/svg"><${name}/></svg>`;

describe('createImportReview', () => {
  it('opens clean text at once and reviews problem imports one at a time', () => {
    const imported: string[] = [];
    const events: string[] = [];
    const { review, dispose } = createRoot((dispose) => ({
      dispose,
      review: createImportReview({
        importSvgText: (_text, name, replaceTabId) => {
          imported.push(replaceTabId ? `${name}@${replaceTabId}` : name);
          return `tab-${name}`;
        },
        openDialog: () => events.push('open'),
        closeDialog: () => events.push('close')
      })
    }));
    const ids: string[] = [];

      review.requestImport(clean, 'clean.svg', { replaceTabId: 'empty', onImported: (id) => ids.push(id) });
      review.requestImport(unrecognized('text'), 'a.svg', { onImported: (id) => ids.push(id) });
      review.requestImport(unrecognized('image'), 'b.svg');
      flush();

      expect(imported).toEqual(['clean.svg@empty']);
      expect(events).toEqual(['open']);
      expect(review.pending()?.name).toBe('a.svg');

      review.resolve(true);
      flush();
      expect(review.pending()?.name).toBe('b.svg');
      expect(events).toEqual(['open']);

      review.resolve(false);
      flush();
      expect(imported).toEqual(['clean.svg@empty', 'a.svg']);
      expect(ids).toEqual(['tab-clean.svg', 'tab-a.svg']);
      expect(events).toEqual(['open', 'close']);
      expect(review.pending()).toBeUndefined();
      dispose();
  });
});
