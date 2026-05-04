import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const workspaceRoot = resolve(process.cwd());
const requestedTarget = process.argv[2] ?? process.env.PORT ?? 'all';
const defaultPorts = [3120, 3200, 3210];
const devProcessNames = new Set([
  'node',
  'npm',
  'pnpm',
  'pnpm.cjs',
  'yarn',
  'yarnpkg',
  'bun',
  'vite',
  'vitest',
  'esbuild',
  'rollup',
  'webpack',
  'tsx',
  'ts-node',
  'nodemon',
  'rsw',
  'serve',
  'http-server',
  'live-server'
]);
const devArgPattern = /\b(pnpm|npm|yarn|yarnpkg|bun|vite|vitest|esbuild|rollup|webpack|tsx|ts-node|nodemon|rsw|serve|http-server|live-server)\b/i;
const protectedArgFragments = [
  '/vscode/',
  '.vscode-server',
  'tsserver.js',
  'typingsInstaller.js',
  'extensionHost',
  'github.copilot',
  'copilot'
];

const explicitPort = parsePort(requestedTarget);

if (requestedTarget !== 'all' && explicitPort === null) {
  globalThis.console.error(`Invalid port: ${requestedTarget}`);
  process.exit(1);
}

const targetPorts = Array.from(new Set(explicitPort === null ? defaultPorts : [explicitPort, ...defaultPorts]));
const initialProcesses = readProcesses();
const protectedPids = collectProtectedPids(initialProcesses);
const initialListeningPids = getListeningPidSet(targetPorts);
const targetPids = collectTargetPids(initialProcesses, protectedPids, initialListeningPids);

if (targetPids.size === 0) {
  globalThis.console.log('Nothing to stop.');
  process.exit(0);
}

globalThis.console.log(`Stopping repo-local app processes: ${listProcessSummaries(initialProcesses, targetPids).join(', ')}`);
killPids(targetPids, 'SIGTERM');
sleep(900);

const afterTermProcesses = readProcesses();
const remainingProtectedPids = collectProtectedPids(afterTermProcesses);
const remainingListeningPids = getListeningPidSet(targetPorts);
const remainingTargetPids = collectTargetPids(afterTermProcesses, remainingProtectedPids, remainingListeningPids);

if (remainingTargetPids.size > 0) {
  globalThis.console.log(`Force stopping remaining repo-local app processes: ${listProcessSummaries(afterTermProcesses, remainingTargetPids).join(', ')}`);
  killPids(remainingTargetPids, 'SIGKILL');
  sleep(300);
}

const finalProcesses = readProcesses();
const finalProtectedPids = collectProtectedPids(finalProcesses);
const finalListeningPids = getListeningPidSet(targetPorts);
const finalTargetPids = collectTargetPids(finalProcesses, finalProtectedPids, finalListeningPids);

if (finalTargetPids.size > 0) {
  globalThis.console.error(`Failed to stop repo-local app processes: ${listProcessSummaries(finalProcesses, finalTargetPids).join(', ')}`);
  process.exit(1);
}

globalThis.console.log('Repo-local app processes stopped.');

function parsePort(value) {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  return port;
}

function runText(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return '';
  }
}

function getListeningPids(port) {
  const output = runText('lsof', ['-ti', `tcp:${port}`]);

  return new Set(
    output
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter(Number.isInteger)
  );
}

function getProcessCwd(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return '';
  }
}

function readProcesses() {
  const output = runText('ps', ['-eo', 'pid=,ppid=,comm=,args=']);

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);

      if (!match) {
        return null;
      }

      const pid = Number.parseInt(match[1], 10);
      const ppid = Number.parseInt(match[2], 10);
      const command = match[3];
      const args = match[4] ?? '';

      if (!Number.isInteger(pid) || !Number.isInteger(ppid)) {
        return null;
      }

      return {
        pid,
        ppid,
        command,
        args,
        cwd: getProcessCwd(pid)
      };
    })
    .filter(Boolean);
}

function isInWorkspace(path) {
  return path === workspaceRoot || path.startsWith(`${workspaceRoot}/`);
}

function isProtectedProcess(processInfo, protectedPids) {
  if (protectedPids.has(processInfo.pid)) {
    return true;
  }

  return protectedArgFragments.some((fragment) => processInfo.args.includes(fragment));
}

function isCandidateRoot(processInfo, protectedPids, listeningPids) {
  if (isProtectedProcess(processInfo, protectedPids)) {
    return false;
  }

  if (processInfo.args.includes('<defunct>')) {
    return false;
  }

  if (listeningPids.has(processInfo.pid)) {
    return true;
  }

  const commandName = processInfo.command.toLowerCase();
  const looksLikeDevTool = devProcessNames.has(commandName) || devArgPattern.test(processInfo.args);

  if (!looksLikeDevTool) {
    return false;
  }

  return isInWorkspace(processInfo.cwd) || processInfo.args.includes(workspaceRoot);
}

function collectProtectedPids(processes) {
  const processesByPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const protectedPids = new Set([process.pid]);

  let currentPid = process.pid;

  while (currentPid > 0) {
    const processInfo = processesByPid.get(currentPid);
    const parentPid = processInfo?.ppid ?? 0;

    if (!parentPid || protectedPids.has(parentPid)) {
      break;
    }

    protectedPids.add(parentPid);
    currentPid = parentPid;
  }

  return protectedPids;
}

function collectTargetPids(processes, protectedPids, listeningPids) {
  const childrenByParent = new Map();

  for (const processInfo of processes) {
    const children = childrenByParent.get(processInfo.ppid) ?? [];

    children.push(processInfo.pid);
    childrenByParent.set(processInfo.ppid, children);
  }

  const targetPids = new Set();
  const queue = [];

  for (const processInfo of processes) {
    if (!isCandidateRoot(processInfo, protectedPids, listeningPids)) {
      continue;
    }

    targetPids.add(processInfo.pid);
    queue.push(processInfo.pid);
  }

  while (queue.length > 0) {
    const pid = queue.shift();
    const childPids = childrenByParent.get(pid) ?? [];

    for (const childPid of childPids) {
      if (protectedPids.has(childPid) || targetPids.has(childPid)) {
        continue;
      }

      targetPids.add(childPid);
      queue.push(childPid);
    }
  }

  return targetPids;
}

function killPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may have already exited.
    }
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function getListeningPidSet(ports) {
  const pids = new Set();

  for (const port of ports) {
    for (const pid of getListeningPids(port)) {
      pids.add(pid);
    }
  }

  return pids;
}

function listProcessSummaries(processes, pids) {
  const processesByPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));

  return [...pids]
    .sort((left, right) => left - right)
    .map((pid) => {
      const processInfo = processesByPid.get(pid);

      if (!processInfo) {
        return String(pid);
      }

      return `${pid}:${processInfo.command}`;
    });
}