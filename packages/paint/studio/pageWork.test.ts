import { expect, it } from 'vitest';
import { createPageWork, ObsoletePageError } from './pageWork';

it('identifies obsolete work by type without treating unrelated errors as cancellation', async () => {
  const work = createPageWork();
  await expect(
    work.run(
      () => 1,
      () => false
    )
  ).rejects.toBeInstanceOf(ObsoletePageError);
  const diskError = new Error('Obsolete virtual page');
  await expect(
    work.run(() => {
      throw diskError;
    })
  ).rejects.toBe(diskError);
  expect(diskError).not.toBeInstanceOf(ObsoletePageError);
});

it('shares upload and job budgets across concurrent producers', async () => {
  let time = 0;
  const windows = new Map<number, number>();
  const work = createPageWork({
    uploadBytes: 100,
    operations: 3,
    now: () => time,
    wait: async (ms) => {
      time += ms;
    }
  });
  await Promise.all(
    Array.from({ length: 12 }, () =>
      work.run(
        () => {
          windows.set(time, (windows.get(time) ?? 0) + 50);
        },
        () => true,
        50
      )
    )
  );
  expect([...windows.values()]).toEqual([100, 100, 100, 100, 100, 100]);
  expect(work.stats().peakUploadBytes).toBe(100);
});
it('yields after CPU time is spent, allowing one bounded operation to overrun', async () => {
  let time = 0,
    waits = 0;
  const work = createPageWork({
    now: () => time,
    wait: async (ms) => {
      waits++;
      time += ms;
    }
  });
  for (let i = 0; i < 3; i++)
    await work.run(() => {
      time += 5;
    });
  expect(waits).toBe(2);
  expect(work.stats().peakWorkCpuMs).toBe(5);
});
it('does not count elapsed storage time as CPU work', async () => {
  let time = 0,
    waits = 0;
  const work = createPageWork({
    now: () => time,
    wait: async () => {
      waits++;
    }
  });
  await work.run(() => {
    time += 1;
  });
  time += 500;
  await work.run(() => {
    time += 1;
  });
  expect(waits).toBe(0);
  expect(work.stats().peakWorkCpuMs).toBe(1);
});
it('rejects obsolete work after a budget wait, before upload', async () => {
  let valid = true,
    ran = false;
  const work = createPageWork({
    operations: 1,
    wait: async () => {
      valid = false;
    }
  });
  await work.run(() => {});
  await expect(
    work.run(
      () => {
        ran = true;
      },
      () => valid
    )
  ).rejects.toThrow('Obsolete virtual page');
  expect(ran).toBe(false);
});
it('bounds page jobs across streaming and explicit overview preparation', async () => {
  const work = createPageWork();
  let release!: () => void,
    active = 0,
    peak = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const jobs = Array.from({ length: 5 }, () =>
    work.task(
      async () => {
        active++;
        peak = Math.max(peak, active);
        await gate;
        active--;
      },
      () => true
    )
  );
  expect(active).toBe(2);
  release();
  await Promise.all(jobs);
  expect(peak).toBe(2);
  expect(work.stats().activePageJobs).toBe(0);
});
it('permits one oversized upload and rejects new jobs after disposal', async () => {
  const work = createPageWork({ uploadBytes: 1 });
  await work.run(
    () => {},
    () => true,
    100
  );
  work.dispose();
  await expect(
    work.task(
      async () => {},
      () => true
    )
  ).rejects.toThrow('Obsolete virtual page');
  await expect(work.run(() => {})).rejects.toThrow('Obsolete virtual page');
});
