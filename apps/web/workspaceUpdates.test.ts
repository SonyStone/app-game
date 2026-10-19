import { describe, expect, it } from 'vitest';
import { parseWorkspaceUpdates } from './workspaceUpdates';

/** A commit as `git log --format=%x1e%cI%x09%s --name-only` prints it. */
function commit(date: string, subject: string, files: string[]) {
  return `\x1e${date}\t${subject}\n\n${files.join('\n')}\n`;
}

describe('parseWorkspaceUpdates', () => {
  it('keeps the newest commit of each workspace directory, without its type and scope', () => {
    const log =
      commit('2026-10-17T23:44:19+02:00', 'feat(paint): safe triangle menu', ['packages/paint/routes.tsx']) +
      commit('2026-10-10T10:00:00+02:00', 'fix(paint)!: older fix', [
        'packages/paint/index.tsx',
        'apps/psd-viewer/src/App.tsx'
      ]);

    expect(parseWorkspaceUpdates(log)).toEqual({
      'packages/paint': { date: '2026-10-17T23:44:19+02:00', subject: 'safe triangle menu' },
      'apps/psd-viewer': { date: '2026-10-10T10:00:00+02:00', subject: 'older fix' }
    });
  });

  it('skips chores, formatting, docs and tests, and files outside workspace directories', () => {
    const log =
      commit('2026-10-18T00:00:00Z', 'style: format everything', ['packages/paint/a.ts']) +
      commit('2026-10-17T00:00:00Z', 'docs(paint): notes', ['packages/paint/README.md']) +
      commit('2026-10-16T00:00:00Z', 'Plain subject', ['packages/paint/b.ts', 'vite.config.ts', 'README.md']);

    expect(parseWorkspaceUpdates(log)).toEqual({
      'packages/paint': { date: '2026-10-16T00:00:00Z', subject: 'Plain subject' }
    });
  });

  it('skips commits that sweep across many directories', () => {
    const files = Array.from({ length: 13 }, (_, index) => `packages/package-${index}/index.ts`);
    const log =
      commit('2026-10-18T00:00:00Z', 'feat: rename everything', files) +
      commit('2026-10-17T00:00:00Z', 'feat: one package', ['packages/package-0/index.ts']);

    expect(parseWorkspaceUpdates(log)).toEqual({
      'packages/package-0': { date: '2026-10-17T00:00:00Z', subject: 'one package' }
    });
  });

  it('reads no history as no updates', () => {
    expect(parseWorkspaceUpdates('')).toEqual({});
  });
});
