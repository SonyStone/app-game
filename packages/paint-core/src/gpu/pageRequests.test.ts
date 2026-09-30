import { expect, it } from 'vitest';
import { createPageRequests } from './pageRequests';

it('keeps one target wanted and loading while another target starts its frame', () => {
  const requests = createPageRequests<string>();
  const first = requests.demand();
  const second = requests.demand();

  first.begin(['pinned']);
  first.request('a', 'page a', 0);
  first.use('slot-a');
  second.begin(['pinned']);
  second.request('b', 'page b', 0);
  second.use('slot-b');

  // Starting the second target's frame must not make the first target's in-flight load obsolete.
  expect(requests.wanted('a')).toBe(true);
  expect(requests.wanted('b')).toBe(true);
  expect(requests.wanted('pinned')).toBe(true);
  expect(requests.inUse('slot-a')).toBe(true);
  expect(requests.inUse('slot-b')).toBe(true);
  expect(requests.pending()).toBe(2);
  expect([requests.take()?.key, requests.take()?.key]).toEqual(['a', 'b']);
  expect(requests.take()).toBeUndefined();
});

it('forgets only the restarting target, merging shared pages by their most urgent priority', () => {
  const requests = createPageRequests<string>();
  const first = requests.demand();
  const second = requests.demand();
  first.begin([]);
  first.request('shared', 'page', 2);
  first.request('old', 'page', 0);
  second.begin([]);
  second.request('shared', 'page', 0);
  second.request('coverage', 'page', 1);

  first.begin([]);

  expect(requests.wanted('old')).toBe(false);
  expect(requests.wanted('shared')).toBe(true);
  expect(requests.take()).toEqual({ key: 'shared', page: 'page' });
  expect(requests.take()?.key).toBe('coverage');
});

it('prefers a reserved request and drops a released target', () => {
  const requests = createPageRequests<string>();
  const first = requests.demand();
  const second = requests.demand();
  first.begin([]);
  first.request('detail', 'page', 0);
  second.begin([]);
  second.request('coarse', 'page', 1);

  expect(requests.take((key) => key === 'coarse')?.key).toBe('coarse');
  expect(requests.targets).toBe(2);

  first.release();
  expect(requests.targets).toBe(1);
  expect(requests.wanted('detail')).toBe(false);
  expect(requests.take()).toBeUndefined();
});
