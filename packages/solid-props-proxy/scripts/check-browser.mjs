import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { checkExamples } from './check-examples.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await compile(true);
const client = await compile(false);
const directory = await mkdtemp(join(tmpdir(), 'solid-props-proxy-'));
const serverFile = join(directory, 'server.mjs');
await writeFile(serverFile, server);
const { renderFixture } = await import(pathToFileURL(serverFile).href);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const messages = [];
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) messages.push(message.text());
  });
  await page.setContent(renderFixture());
  await page.addScriptTag({ content: client });
  assert.deepEqual(await page.evaluate(() => proxyChecks.checkHydration()), {
    before: 'black',
    sameNodes: true,
    after: 'red',
    covered: 'red',
    updated: 'blue',
    restored: 'green',
    final: 'purple',
    calls: ['base', 'proxy', 'base'],
    methodsRestored: true
  });
  assert.deepEqual(await page.evaluate(() => proxyChecks.checkStyleLayers()), {
    updated: ['15px', '20px'],
    lowerRemoved: ['1px', '20px', 'blue'],
    restored: ['1px', 'important', 'important'],
    methodsRestored: true
  });
  const cancelledPage = await browser.newPage();
  cancelledPage.on('pageerror', (error) => messages.push(error.message));
  cancelledPage.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) messages.push(message.text());
  });
  await cancelledPage.setContent(renderFixture());
  await cancelledPage.addScriptTag({ content: client });
  assert.deepEqual(await cancelledPage.evaluate(() => proxyChecks.checkCancelledHydration()), {
    color: 'black',
    calls: ['base'],
    methodsUntouched: true
  });
  assert.deepEqual(messages, []);
  await checkExamples(browser, client);
  console.log('Chromium: SSR hydration, style layers, native restoration, and delegated cleanup passed.');
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}

/** Builds both halves from current source with the workspace's Solid compiler/runtime. */
async function compile(ssr) {
  const entry = `${root}/tests/${ssr ? 'server' : 'browser'}-entry.ts`;
  const output = await build({
    configFile: false,
    root,
    logLevel: 'error',
    mode: 'development',
    plugins: [solid({ ssr: true, solid: { hydratable: true } })],
    define: { 'process.env.NODE_ENV': '"development"' },
    resolve: { conditions: ['browser', 'development'] },
    ssr: { noExternal: true, resolve: { conditions: ['node', 'development'] } },
    build: {
      write: false,
      minify: false,
      ssr,
      lib: { entry, name: 'proxyChecks', formats: [ssr ? 'es' : 'iife'] }
    }
  });
  const files = output[0].output;
  const code = files.find((item) => item.type === 'chunk' && item.isEntry).code;
  if (ssr) return code;
  const css = files
    .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => item.source)
    .join('\n');
  return `document.head.appendChild(Object.assign(document.createElement('style'), {textContent: ${JSON.stringify(css)}}));\n${code}`;
}
