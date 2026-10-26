import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Usage: pnpm benchmark [output-directory]. PSD_BENCH_CASES selects comma-separated fixture names;
// PSD_BENCH_RUNS defaults to 3, PSD_BENCH_DPR to 1, PSD_BENCH_OPEN_ONLY=1 skips gestures/probes.
// PSD_BENCH_BEHAVIORS=1 measures cancellation, restart and strict fallback.
// PSD_BENCH_FEATURES=1 also runs the audit's feature/cache probes. PSD_BENCH_BACKEND selects webgpu/canvas2d.
const app = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] ?? `${tmpdir()}/psd-viewer-benchmark-${Date.now()}`);
const backend = process.env.PSD_BENCH_BACKEND ?? 'webgpu';
if (!['webgpu', 'canvas2d'].includes(backend)) {
  throw new Error(`Unavailable display backend: ${backend}. Available: webgpu, canvas2d`);
}
if (!process.env.PSD_TEXT_MIXER_RESEARCH_ROOT) {
  throw new Error('Set PSD_TEXT_MIXER_RESEARCH_ROOT to the fixture research checkout.');
}
await mkdir(`${out}/assets`, { recursive: true });
execFileSync('pnpm', ['build'], { cwd: app, stdio: 'inherit' });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(app, 'dist', `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(resolve(app, 'dist') + '/')) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  const env = { ...process.env, PSD_BENCH_OUT: out, PSD_BENCH_URL: `http://127.0.0.1:${address.port}` };
  await writeFile(
    `${out}/environment.json`,
    JSON.stringify(
      {
        build: 'production',
        backend,
        dpr: Number(env.PSD_BENCH_DPR ?? 1),
        runs: Number(env.PSD_BENCH_RUNS ?? 3),
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: app, encoding: 'utf8' }).trim(),
        workingDiff: execFileSync('git', ['diff', '--stat', '--', 'apps/psd-viewer', 'packages/psd'], {
          cwd: app,
          encoding: 'utf8'
        }),
        started: new Date().toISOString()
      },
      null,
      2
    )
  );
  for (const driver of [
    'bench-repeat.mjs',
    ...(env.PSD_BENCH_FEATURES === '1' ? ['features.mjs'] : []),
    ...(env.PSD_BENCH_BEHAVIORS === '1' ? ['opening-behaviors.mjs'] : [])
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [new URL(driver, import.meta.url).pathname], {
        cwd: app,
        env,
        stdio: 'inherit'
      });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${driver} exited ${code}`))));
    });
  }
  console.log(`Benchmark JSON and screenshots: ${out}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
