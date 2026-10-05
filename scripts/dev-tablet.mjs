/**
 * Runs `@app-game/web` dev on the USB-connected Android tablet.
 *
 * Usage: `pnpm dev:tablet [path]`, e.g. `pnpm dev:tablet /paint`.
 *
 * Maps the dev port into the tablet with `adb reverse`, so the page opens as `http://localhost:<port>` — a secure
 * context, which WebGPU requires. Starts Vite with a strict port, opens the page in the tablet's Chrome once the
 * server answers, and removes the mapping on exit if this script created it. When a Vite server already runs on the
 * port (e.g. `pnpm start`), it is reused: the script only maps the port, opens the page and exits, leaving the
 * mapping in place.
 *
 * Environment: `APP_PORT`/`PORT` choose the port (default 3120, same as the Vite config); `ANDROID_SERIAL` picks the
 * device when several are connected; `ADB` overrides the adb binary.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const port = Number(process.env.APP_PORT ?? process.env.PORT ?? '3120');
const pagePath = normalizePagePath(process.argv[2] ?? '/');
const adb = findAdb();
const serial = selectDevice();
const portState = await probePort();

if (portState === 'busy') {
  fail(`Port ${port} is taken by something other than a Vite dev server. Free it or choose another APP_PORT.`);
}

const createdReverse = reversePort();

globalThis.console.log(`Tablet ${serial}: localhost:${port} → this machine's :${port}`);

if (portState === 'vite') {
  globalThis.console.log(`Reusing the Vite dev server already running on :${port}.`);
  openOnTablet();
} else {
  await startDevServer();
}

/**
 * Keeps the optional page argument a root-relative path.
 *
 * @param {string} path
 * @returns {string}
 */
function normalizePagePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Finds adb in `ADB`, the Android SDK environment variables, the default macOS SDK location or `PATH`.
 *
 * @returns {string}
 */
function findAdb() {
  if (process.env.ADB) {
    return process.env.ADB;
  }

  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Library/Android/sdk')];

  for (const sdkRoot of sdkRoots) {
    const candidate = sdkRoot && join(sdkRoot, 'platform-tools', 'adb');

    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return 'adb';
}

/**
 * Picks `ANDROID_SERIAL` or the only connected device; exits when that is ambiguous or nothing is connected.
 *
 * @returns {string}
 */
function selectDevice() {
  const devices = runAdb(['devices'], { global: true })
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device')
    .map(([id]) => id);

  if (process.env.ANDROID_SERIAL) {
    if (!devices.includes(process.env.ANDROID_SERIAL)) {
      fail(`Device ${process.env.ANDROID_SERIAL} is not connected (connected: ${devices.join(', ') || 'none'}).`);
    }

    return process.env.ANDROID_SERIAL;
  }

  if (devices.length === 0) {
    fail('No authorized Android device found. Connect the tablet over USB and allow USB debugging.');
  }

  if (devices.length > 1) {
    fail(`Several devices are connected (${devices.join(', ')}). Choose one with ANDROID_SERIAL.`);
  }

  return devices[0];
}

/**
 * Checks what listens on the dev port over IPv4 and IPv6, since a Vite server bound to `localhost` may use only one.
 *
 * @returns {Promise<'free' | 'vite' | 'busy'>} `vite` when `/@vite/client` answers, `busy` for any other HTTP reply.
 */
async function probePort() {
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const response = await globalThis.fetch(`http://${host}:${port}/@vite/client`, {
        signal: globalThis.AbortSignal.timeout(3000)
      });

      return response.ok ? 'vite' : 'busy';
    } catch {
      // Nothing answers on this address.
    }
  }

  return 'free';
}

/**
 * Maps the tablet's `localhost:<port>` to this machine, keeping a mapping that already exists.
 *
 * @returns {boolean} Whether this script created the mapping and should remove it on exit.
 */
function reversePort() {
  const existing = runAdb(['reverse', '--list']).includes(`tcp:${port} tcp:${port}`);

  if (existing) {
    return false;
  }

  runAdb(['reverse', `tcp:${port}`, `tcp:${port}`]);

  return true;
}

/**
 * Starts the dev server, stops its whole process tree on SIGINT/SIGTERM, exits with its exit code and opens the page
 * once it answers.
 */
async function startDevServer() {
  const devServer = spawn('pnpm', ['--filter', '@app-game/web', 'dev', '--strictPort'], {
    stdio: 'inherit',
    env: { ...process.env, APP_PORT: String(port) }
  });

  devServer.on('exit', (code, signal) => {
    removeReverse();
    process.exit(code ?? (signal ? 1 : 0));
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      signalProcessTree(devServer.pid, signal);
    });
  }

  await waitForServer();
  openOnTablet();
}

/** Removes the port mapping if this script created it; the tablet may already be unplugged. */
function removeReverse() {
  if (!createdReverse) {
    return;
  }

  try {
    runAdb(['reverse', '--remove', `tcp:${port}`]);
  } catch {
    // The device is gone, and its mappings with it.
  }
}

/**
 * Signals a process and all its descendants. The pnpm wrappers between this script and Vite do not forward signals,
 * so stopping only the direct child would leave Vite holding the port.
 *
 * @param {number | undefined} pid
 * @param {NodeJS.Signals} signal
 */
function signalProcessTree(pid, signal) {
  if (pid === undefined) {
    return;
  }

  let children = [];

  try {
    children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number);
  } catch {
    // pgrep exits with 1 when the process has no children.
  }

  for (const child of children) {
    signalProcessTree(child, signal);
  }

  try {
    process.kill(pid, signal);
  } catch {
    // The process has already exited.
  }
}

/** Polls the dev server until it answers, so the tablet does not open an error page. */
async function waitForServer() {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    try {
      await globalThis.fetch(`http://127.0.0.1:${port}/`);

      return;
    } catch {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    }
  }

  globalThis.console.warn(`Dev server did not answer on :${port}; open http://localhost:${port}${pagePath} manually.`);
}

/** Opens the page in the tablet's Chrome. */
function openOnTablet() {
  const url = `http://localhost:${port}${pagePath}`;

  try {
    runAdb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, 'com.android.chrome']);
    globalThis.console.log(`Opened ${url} on the tablet.`);
  } catch (error) {
    globalThis.console.warn(`Could not open Chrome on the tablet: ${error.message}`);
  }
}

/**
 * Runs adb against the selected device.
 *
 * @param {string[]} args
 * @param {{ global?: boolean }} [options] `global` skips `-s <serial>`, for commands run before a device is chosen.
 * @returns {string} Standard output.
 */
function runAdb(args, { global = false } = {}) {
  const deviceArgs = global ? [] : ['-s', serial];

  try {
    return execFileSync(adb, [...deviceArgs, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail('adb not found. Install Android platform-tools or set ADB / ANDROID_HOME.');
    }

    throw error;
  }
}

/**
 * Prints the message and exits with a failure code.
 *
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  globalThis.console.error(message);
  process.exit(1);
}
