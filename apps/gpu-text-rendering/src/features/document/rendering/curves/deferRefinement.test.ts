import { afterEach, expect, it, vi } from 'vitest';
import { deferRefinement } from './deferRefinement';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('coalesces queued refinement while yielding to other browser tasks', () => {
  const { jobs, run, task } = setup();
  task.schedule(0);
  task.schedule(0);
  expect(run).not.toHaveBeenCalled();
  expect(jobs).toHaveLength(1);
  jobs.shift()!();
  expect(run).toHaveBeenCalledTimes(1);
  task.destroy();
});

it('ignores an already posted stale view after cancellation and rescheduling', () => {
  const { jobs, run, task } = setup();
  task.schedule(0);
  task.cancel();
  task.schedule(0);
  jobs.shift()!();
  expect(run).not.toHaveBeenCalled();
  jobs.shift()!();
  expect(run).toHaveBeenCalledTimes(1);
  task.destroy();
});

it('cancels delayed work and closes both ports on disposal', () => {
  vi.useFakeTimers();
  const { jobs, run, task, closes } = setup();
  task.schedule(20);
  task.destroy();
  vi.advanceTimersByTime(30);
  task.schedule(0);
  expect(jobs).toHaveLength(0);
  expect(run).not.toHaveBeenCalled();
  expect(closes).toHaveBeenCalledTimes(2);
});

function setup() {
  const jobs: (() => void)[] = [];
  const closes = vi.fn();
  vi.stubGlobal(
    'MessageChannel',
    class {
      port1 = { onmessage: undefined as ((event: { data: number }) => void) | undefined, close: closes };
      port2 = { postMessage: (data: number) => jobs.push(() => this.port1.onmessage?.({ data })), close: closes };
    }
  );
  const run = vi.fn();
  return { jobs, closes, run, task: deferRefinement(run) };
}
