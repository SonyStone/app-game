import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import { env } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * Smoke test of the editor in the real Safari, driven by `safaridriver`. Playwright's WebKit build has no WebGPU, so
 * this is the only automated run on WebKit's Metal WebGPU backend, the same one iPad Safari uses: the adapter, the
 * engine start-up, a mouse stroke with undo/redo, and the touch guards iPad Safari depends on.
 *
 *   node tests/browser/safari.browser.mjs
 *
 * Needs macOS with Safari 26 or later and "Allow remote automation" enabled in Safari Settings → Developer (shown after
 * Settings → Advanced → "Show features for web developers"). Safari opens a visible automation window; only one
 * automation session can run at a time. Starts its own Vite dev server unless `PAINT_URL` points at a running one, and
 * saves a final screenshot to the temporary directory. Safari 26 has WebGPU on by default only on macOS 26: on earlier
 * macOS enable Develop → Feature Flags → WebGPU, or point `SAFARIDRIVER` at Safari Technology Preview's driver.
 * Exits non-zero on the first failed step or on a page error.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.PAINT_URL ? undefined : await startServer();
const baseURL = process.env.PAINT_URL ?? server.resolvedUrls.local[0].replace(/\/$/, '');
const driver = await startSafariDriver();
let session;

try {
  session = await openSession(driver.url);
  await session.command('POST', '/window/rect', { width: 1280, height: 800 });
  await session.command('POST', '/url', { url: `${baseURL}/` });
  await session.run(collectPageErrors);

  await step('WebGPU opens an adapter', async () => {
    const adapter = await session.run(async () => {
      if (!navigator.gpu) {
        return {
          missing:
            `navigator.gpu is undefined in ${navigator.userAgent}. Safari 26 enables WebGPU by default only on ` +
            'macOS 26; on earlier macOS turn on Develop → Feature Flags → WebGPU, or run Safari Technology Preview ' +
            'with SAFARIDRIVER="/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver".'
        };
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { missing: 'navigator.gpu.requestAdapter() resolved null' };
      }

      const { maxBufferSize, maxStorageBufferBindingSize, maxTextureDimension2D } = adapter.limits;
      return {
        info: `${adapter.info.vendor} ${adapter.info.architecture}`.trim(),
        features: [...adapter.features].sort(),
        limits: { maxBufferSize, maxStorageBufferBindingSize, maxTextureDimension2D },
        preferredFormat: navigator.gpu.getPreferredCanvasFormat()
      };
    });
    assert.equal(adapter.missing, undefined, adapter.missing);
    console.log(`     ${JSON.stringify(adapter)}`);
  });

  await step('the editor starts without an error notice', async () => {
    await waitForSaved();
    assert.equal(await session.run(() => document.querySelector('[role="alert"]')?.textContent ?? null), null);
  });

  await step('touch guards are in effect', async () => {
    const guards = await session.run(() => {
      const workspace = document.querySelector('main[aria-label="Drawing workspace"]');
      return {
        canvas: getComputedStyle(workspace.querySelector('canvas')).touchAction,
        studio: getComputedStyle(workspace.parentElement).touchAction,
        coalescedEvents: typeof PointerEvent.prototype.getCoalescedEvents === 'function'
      };
    });
    assert.deepEqual(guards, { canvas: 'none', studio: 'pan-x pan-y', coalescedEvents: true });
  });

  await step('a mouse stroke can be undone and redone', async () => {
    assert.equal(await buttonDisabled('Undo'), true);
    await stroke();
    await waitForSaved();
    await waitFor(async () => !(await buttonDisabled('Undo')), 'Undo to become enabled');
    await click('Undo');
    await waitFor(async () => !(await buttonDisabled('Redo')), 'Redo to become enabled');
    await click('Redo');
    await waitFor(async () => await buttonDisabled('Redo'), 'Redo to become disabled');
  });

  await step('no page errors were reported', async () => {
    assert.deepEqual(await session.run(() => window.__safariSmokeErrors), []);
  });

  const screenshot = path.join(os.tmpdir(), 'paint-safari.png');
  await writeFile(screenshot, Buffer.from(await session.command('GET', '/screenshot'), 'base64'));
  console.log(`Screenshot: ${screenshot}`);
} finally {
  await session?.close();
  driver.process.kill();
  await server?.close();
}

/** Records uncaught errors, rejections and `console.error` calls from now on in `window.__safariSmokeErrors`. */
function collectPageErrors() {
  const errors = (window.__safariSmokeErrors = []);
  window.addEventListener('error', (event) => errors.push(`error: ${event.message}`));
  window.addEventListener('unhandledrejection', (event) => errors.push(`rejection: ${event.reason}`));
  const consoleError = console.error;
  console.error = (...args) => {
    errors.push(`console.error: ${args.join(' ')}`);
    consoleError.apply(console, args);
  };
}

async function step(name, check) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`FAIL ${name}: ${error.message}`, { cause: error });
  }
}

/** Waits until the engine is ready and has no pending changes. */
function waitForSaved() {
  return waitFor(
    () => session.run(() => [...document.querySelectorAll('[role="status"]')].some((s) => s.textContent === 'Saved')),
    'the Saved status',
    30_000
  );
}

/** Polls `check` every 100 ms until it resolves truthy; `what` names the condition in the timeout error. */
async function waitFor(check, what, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Whether the button labelled `name` is disabled; throws when there is no such button. */
async function buttonDisabled(name) {
  const disabled = await session.run(
    (name) => document.querySelector(`button[aria-label="${name}"]`)?.disabled ?? null,
    name
  );
  assert.notEqual(disabled, null, `no button labelled ${name}`);
  return disabled;
}

/** Clicks the center of the button labelled `name` with real pointer input. */
async function click(name) {
  const point = await session.run((name) => {
    const box = document.querySelector(`button[aria-label="${name}"]`)?.getBoundingClientRect();
    return box && { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }, name);
  assert.ok(point, `no button labelled ${name}`);
  await session.pointer([move(point), { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]);
}

/** Draws a short diagonal mouse stroke in the middle of the canvas. */
async function stroke() {
  const center = await session.run(() => {
    const box = document.querySelector('main[aria-label="Drawing workspace"]').getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
  await session.pointer([
    move(center),
    { type: 'pointerDown', button: 0 },
    ...Array.from({ length: 10 }, (_, i) => move({ x: center.x + (i + 1) * 12, y: center.y + (i + 1) * 6 }, 16)),
    { type: 'pointerUp', button: 0 }
  ]);
}

function move({ x, y }, duration = 0) {
  return { type: 'pointerMove', origin: 'viewport', x, y, duration };
}

/**
 * Creates a Safari WebDriver session. `run` executes `script` in the page with JSON `args` and resolves with its
 * awaited result; `pointer` performs one mouse action sequence.
 */
async function openSession(driverURL) {
  const created = await webDriver(driverURL, 'POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari' } }
  }).catch((error) => {
    throw new Error(
      `${error.message}\nEnable Safari Settings → Developer → "Allow remote automation" (and run \`safaridriver --enable\` once if asked).`,
      { cause: error }
    );
  });
  const command = (method, route, body) => webDriver(`${driverURL}/session/${created.sessionId}`, method, route, body);
  return {
    command,
    run: (script, ...args) =>
      command('POST', '/execute/async', {
        script: `const done = arguments[arguments.length - 1];
          Promise.resolve((${script}).apply(null, Array.from(arguments).slice(0, -1)))
            .then((value) => done({ value: value ?? null }), (error) => done({ error: String(error) }));`,
        args
      }).then((result) => {
        if (result.error) {
          throw new Error(`page script failed: ${result.error}`);
        }

        return result.value;
      }),
    pointer: (actions) =>
      command('POST', '/actions', {
        actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions }]
      }),
    close: () => command('DELETE', '').catch(() => {})
  };
}

/** Sends one W3C WebDriver command and resolves with its `value`; WebDriver errors reject with their message. */
async function webDriver(base, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const { value } = await response.json();
  if (!response.ok) {
    throw new Error(`WebDriver ${method} ${route}: ${value?.message ?? response.status}`);
  }

  return value;
}

/** Starts `safaridriver` on a free port and waits until it answers. */
async function startSafariDriver() {
  const port = await freePort();
  const process = spawn(env.SAFARIDRIVER || 'safaridriver', ['--port', String(port)], { stdio: 'inherit' });
  const url = `http://127.0.0.1:${port}`;
  await waitFor(
    () => fetch(`${url}/status`).then((response) => response.ok, () => false),
    'safaridriver to start'
  );
  return { process, url };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

/** A dev server without file watching, so edits made during the run never reload the page. */
async function startServer() {
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null }
  });
  await server.listen();
  return server;
}
