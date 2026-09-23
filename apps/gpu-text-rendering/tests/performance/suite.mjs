import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Sequential runs isolate GPU load and include cold zoom transitions on each device.
const input = process.argv[2];
if (!input) {
  throw new Error('Usage: node tests/performance/suite.mjs /absolute/document.gdoc');
}
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-navigation-performance';
const runner = fileURLToPath(new URL('./pan.browser.mjs', import.meta.url));
const cases = [
  { name: 'overview', scale: 1 },
  { name: 'near-overview', scale: 0.4 },
  { name: 'medium', scale: 0.25 },
  { name: 'page', scale: 0.05 },
  { name: 'detail', scale: 0.015 },
  { name: 'letter', scale: 0.0003, page: Number(process.env.GPU_TEXT_DETAIL_PAGE ?? 1) },
  { name: 'zoom-cycle', scale: 1, motion: 'zoom', page: Number(process.env.GPU_TEXT_ZOOM_PAGE ?? 0) }
];
const report = [];
await mkdir(output, { recursive: true });
for (const scenario of cases) {
  const folder = path.join(output, scenario.name);
  console.log(`SCENARIO ${scenario.name}`);
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, input], {
      stdio: 'inherit',
      env: {
        ...process.env,
        GPU_TEXT_OUTPUT: folder,
        GPU_TEXT_ZOOM_SCALE: String(scenario.scale),
        GPU_TEXT_PAGE: String(scenario.page ?? 0),
        GPU_TEXT_MOTION: scenario.motion ?? 'pan'
      }
    });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (status !== 0) {
    process.exitCode = 1;
    break;
  }
  report.push({ name: scenario.name, ...JSON.parse(await readFile(path.join(folder, 'report.json'), 'utf8')) });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
