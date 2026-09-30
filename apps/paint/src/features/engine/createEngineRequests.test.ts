import { err, ok, type Result } from 'neverthrow';
import { createRoot } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { brushError, engineError, type PaintError } from '../../shared/errors';
import { createEngineRequests } from './createEngineRequests';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

it('correlates replies by request id and ignores unrelated or repeated replies', async () => {
  const { requests, posted, post } = setup();
  const first = requests.request(post);
  expect(requests.isBusy()).toBe(true);
  requests.receive('unrelated', { ok: true, value: 'other' });
  requests.receive(posted[0]!, { ok: false, error: 'Unsupported' });
  requests.receive(posted[0]!, { ok: true, value: 'late duplicate' });
  expect(await first).toEqual(err(brushError('command', 'Unsupported')));
  expect(requests.isBusy()).toBe(false);

  const second = requests.request(post);
  requests.receive(posted[1]!, { ok: true, value: 'done' });
  expect(await second).toEqual(ok('done'));
});

it('reports transport failures without leaving the request outstanding', async () => {
  const { requests } = setup();
  const failure = engineError('stopped', 'Cannot clone command');
  expect(await requests.request(() => err(failure))).toEqual(err(failure));
  expect(requests.isBusy()).toBe(false);
});

it('frees the caller on timeout, delivers a late reply to a same-key retry and runs onReply once', async () => {
  vi.useFakeTimers();
  const { requests, posted, post } = setup();
  const onReply = vi.fn();
  const first = requests.request(post, 'tip', onReply);
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await first)._unsafeUnwrapErr()).toMatchObject({ kind: 'engine', code: 'timeout' });
  expect(requests.isBusy()).toBe(false);

  const retry = requests.request(post, 'tip', onReply);
  expect(posted).toHaveLength(1);
  requests.receive(posted[0]!, { ok: true, value: 'uploaded' });
  expect(await retry).toEqual(ok('uploaded'));
  expect(onReply).toHaveBeenCalledExactlyOnceWith('uploaded');
});

it('settles outstanding requests on disconnect and disposal', async () => {
  const { requests, posted, post } = setup();
  const replaced = requests.request(post);
  requests.disconnect();
  expect((await replaced)._unsafeUnwrapErr()).toMatchObject({ kind: 'engine', code: 'disconnected' });
  requests.receive(posted[0]!, { ok: true, value: 'too late' });

  const disposed = requests.request(post);
  dispose?.();
  dispose = undefined;
  expect((await disposed)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
});

function setup() {
  const posted: string[] = [];
  const requests = createRoot((stop) => {
    dispose = stop;
    return createEngineRequests<string>({ timeoutMs: 1_000, failure: (message) => brushError('command', message) });
  });
  const post = (requestId: string): Result<void, PaintError> => {
    posted.push(requestId);
    return ok();
  };
  return { requests, posted, post };
}
