import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// An independent Canvas2D reference helps distinguish converter defects from Poppler differences.
const directory = process.argv[2];
const output = process.env.GPU_TEXT_OUTPUT ?? path.join(directory, 'results');
const manifest = JSON.parse(
  await readFile(process.env.GPU_TEXT_MANIFEST ?? new URL('./manifest.json', import.meta.url))
);
const pdfjs = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const browser = await chromium.launch({ headless: true });
await mkdir(output, { recursive: true });
const version = JSON.parse(await readFile(path.join(pdfjs, 'package.json'))).version;
await writeFile(
  path.join(output, 'pdfjs-reference.json'),
  JSON.stringify({ version, chromium: browser.version() }, null, 2)
);

try {
  for (const entry of manifest.cases) {
    if (process.env.GPU_TEXT_CASE && !entry.id.includes(process.env.GPU_TEXT_CASE)) {
      continue;
    }

    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route('http://reference.local/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' });
      }

      if (pathname === '/input.pdf') {
        return route.fulfill({ path: path.resolve(directory, entry.file), contentType: 'application/pdf' });
      }

      const resource = path.resolve(pdfjs, `.${pathname}`);

      if (!resource.startsWith(`${pdfjs}${path.sep}`)) {
        return route.abort();
      }

      return route.fulfill({
        path: resource,
        contentType: pathname.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'
      });
    });
    await page.goto('http://reference.local/');
    const count = await page.evaluate(async () => {
      const pdfjs = await import('/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/build/pdf.worker.mjs';
      window.referenceDocument = await pdfjs.getDocument({
        url: '/input.pdf',
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/standard_fonts/',
        wasmUrl: '/wasm/'
      }).promise;
      return referenceDocument.numPages;
    });
    const pages = entry.pages === 'all' ? Array.from({ length: count }, (_, index) => index + 1) : entry.pages;
    const destination = path.join(output, entry.id);
    await mkdir(destination, { recursive: true });

    for (const number of pages) {
      await page.evaluate(async (number) => {
        const pdfPage = await referenceDocument.getPage(number);
        const natural = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: 800 / Math.max(natural.width, natural.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        document.body.replaceChildren(canvas);
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }, number);
      await page.locator('canvas').screenshot({ path: path.join(destination, `${number}-pdfjs.png`) });
    }

    console.log(entry.id, pages.length);
    await page.close();
  }
} finally {
  await browser.close();
}
