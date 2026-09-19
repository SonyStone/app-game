import type { AbrDocument } from '@app-game/abr-parser';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
declare global {
  interface Window {
    parsers: { js: typeof import('@app-game/abr-parser'); wasm: typeof import('@app-game/abr-parser/wasm-parser') };
    documentAbr: AbrDocument;
  }
}

test('parser imports defer both implementations; JS never fetches WASM', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  const fixture = fileURLToPath(new URL('../../../packages/abr-parser/tests/lazy.html', import.meta.url));
  await page.goto(`/@fs/${fixture}`);
  await page.waitForFunction(() => 'parsers' in window);
  const runtimeRequests = () =>
    requested.filter((url) => /\/src\/js\/|\/wasm\/dist\/abr-wasm-runtime|\/wasm\/pkg\//.test(url));
  expect(runtimeRequests()).toEqual([]);
  await page.evaluate(async () => {
    const { js } = window.parsers;
    await js.initAbr();
    window.documentAbr = js.createAbr([
      {
        name: 'Lazy',
        tip: {
          kind: 'computed',
          diameter: js.pixels(32),
          hardness: js.percent(45),
          roundness: js.percent(100),
          angle: js.degrees(0),
          spacing: js.percent(25),
          spacingEnabled: true
        }
      }
    ]);
  });
  expect(runtimeRequests().some((url) => url.includes('/src/js/abr-js-runtime.ts'))).toBe(true);
  expect(runtimeRequests().filter((url) => url.includes('/wasm/'))).toEqual([]);
  const result = await page.evaluate(async () => {
    const { js, wasm } = window.parsers;
    await wasm.initAbr();
    const document = wasm.parseAbr(js.writeAbr(window.documentAbr));
    return { name: document.brushes[0]!.name, hardness: document.brushes[0]!.tip!.hardness };
  });
  expect(result).toEqual({ name: 'Lazy', hardness: 45 });
  expect(requested.filter((url) => /\.wasm(?:\?|$)/.test(url))).toHaveLength(1);
});
