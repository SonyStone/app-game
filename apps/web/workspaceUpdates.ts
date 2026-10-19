import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

/** The latest change of one workspace directory: when it was committed and what it did. */
export type WorkspaceUpdate = { date: string; subject: string };

const moduleId = 'virtual:workspace-updates';

/**
 * Serves `virtual:workspace-updates`, whose default export maps every workspace directory (`apps/<name>`,
 * `packages/<name>`) to its latest `WorkspaceUpdate`, for the start page's "Recently updated" list. Reads the
 * last 400 commits from git when the module first loads, once per build or dev server. Merges, chores,
 * formatting, docs, tests and commits that sweep across more than 12 directories say nothing about one
 * project and are skipped; a conventional commit's `type(scope):` prefix is dropped from the subject.
 * Without git, or with a shallow clone, it serves what history there is, down to an empty object.
 */
export function workspaceUpdates(): Plugin {
  const resolvedId = `\0${moduleId}`;

  return {
    name: 'workspace-updates',
    resolveId(source) {
      return source === moduleId ? resolvedId : undefined;
    },
    async load(id) {
      if (id !== resolvedId) {
        return;
      }

      return `export default ${JSON.stringify(await readUpdates())};`;
    }
  };
}

async function readUpdates() {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const log = await promisify(execFile)(
    'git',
    ['log', '--no-merges', '-n', '400', `--format=${logFormat}`, '--name-only'],
    {
      cwd: repository,
      maxBuffer: 64 * 1024 * 1024
    }
  ).then(
    (result) => result.stdout,
    () => ''
  );

  return parseWorkspaceUpdates(log);
}

/** Each commit as a record separator, its committer date, a tab and its subject; `--name-only` lists its files. */
const logFormat = '%x1e%cI%x09%s';

/** Reads `git log --name-only` output in `logFormat`, newest commit first, into the latest update per directory. */
export function parseWorkspaceUpdates(log: string) {
  const updates: Record<string, WorkspaceUpdate> = {};

  for (const entry of log.split('\x1e').slice(1)) {
    const [header = '', ...files] = entry.split('\n');
    const [date = '', rawSubject = ''] = header.split('\t');
    const commit = /^(\w+)(?:\([^)]*\))?!?:\s*(.*)$/.exec(rawSubject);
    if (commit && skippedTypes.has(commit[1]!)) {
      continue;
    }

    const directories = new Set(
      files
        .map((file) => /^((?:apps|packages)\/[^/]+)\//.exec(file)?.[1])
        .filter((directory) => directory !== undefined)
    );
    if (directories.size > 12) {
      continue;
    }

    // The log runs newest first, so the first commit seen for a directory is its latest.
    for (const directory of directories) {
      updates[directory] ??= { date, subject: commit?.[2] ?? rawSubject };
    }
  }

  return updates;
}

const skippedTypes = new Set(['chore', 'style', 'build', 'ci', 'docs', 'test']);
