import { mountWorker, WorkerTasks } from '@app-game/solid-gpu/worker';
import { err, ok } from 'neverthrow';
import { rasterizeRowTable } from '../../plan/outlineTable';
import type { DetailTableRequest, DetailTableWorkerReply } from './createDetailTableWorker';

// Serves single-flight batches from createDetailTableWorker with one reusable 2D canvas.
mountWorker(() => {
  const context = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });

  return (
    <WorkerTasks<DetailTableRequest, DetailTableWorkerReply>
      execute={({ outlines }) => {
        if (!context) {
          return err('2D canvas rendering is unavailable');
        }

        return ok({
          tables: outlines.map(({ key, rule, grid, window, curves }) => ({
            key,
            words: rasterizeRowTable(context, curves, { first: 0, count: curves.length / 8, rule }, grid, window)
          }))
        });
      }}
      error={String}
      transfer={(value) => value.tables.map(({ words }) => words.buffer)}
    />
  );
}, self);
