import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// PDF DCT streams ignore Exif orientation. Browsers apply it by default, which would
// transpose (5-8) or mirror (2-4) images, so the raster decoder must neutralize it.
const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const browser = await chromium.launch({ channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(`${baseURL}/tests/browser/empty.html`);
  const results = await page.evaluate(async () => {
    const { createRasterDecoder } = await import('/src/features/document/rendering/curves/createRasterDecoder.ts');
    const width = 32;
    const height = 16;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#f00';
    context.fillRect(0, 0, width / 2, height);
    context.fillStyle = '#00f';
    context.fillRect(width / 2, 0, width / 2, height);
    const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 })).arrayBuffer());

    return Promise.all(
      [1, 2, 6, 8].map(async (orientation) => {
        const bytes = withOrientation(jpeg, orientation);
        // The fixture is meaningful only if the browser itself applies the Exif orientation.
        const raw = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        const applied = orientation >= 5 ? raw.width === height : raw.width === width;
        raw.close();
        // Outside an owner the decoder simply has no cleanup; each request carries its own bytes.
        const request = { id: 0, bytes, width, height, codec: 2, tailLevel: 0, tiles: [] };
        const reply = await createRasterDecoder().decode(request);
        if (reply.isErr()) {
          return { orientation, applied, error: reply.error };
        }

        // Level 0 starts one border texel inside the packed tail.
        const tail = new Uint8Array(reply.value.tail.pixels);
        const texel = (x, y) => [
          ...tail.subarray(
            ((y + 1) * reply.value.tail.width + x + 1) * 4,
            ((y + 1) * reply.value.tail.width + x + 2) * 4
          )
        ];
        return { orientation, applied, left: texel(2, 8), right: texel(width - 3, 8) };
      })
    );

    /** Inserts a big-endian APP1 Exif segment with one Orientation entry after SOI. */
    function withOrientation(jpeg, orientation) {
      // Big-endian TIFF header, one IFD entry: tag 0x0112 SHORT count 1, then no next IFD.
      const tiff = [...hex('4d4d002a000000080001011200030000000100'), orientation, ...hex('000000000000')];
      const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
      const length = payload.length + 2;
      const app1 = [0xff, 0xe1, length >> 8, length & 255, ...payload];
      return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]).buffer;
    }

    function hex(text) {
      return text.match(/../g).map((byte) => parseInt(byte, 16));
    }
  });

  for (const result of results) {
    assert.ok(result.applied, `browser ignored Exif orientation ${result.orientation}`);
    assert.equal(result.error, undefined, `orientation ${result.orientation}: ${result.error}`);
    assert.ok(result.left[0] > 200 && result.left[2] < 60, `orientation ${result.orientation} left ${result.left}`);
    assert.ok(result.right[2] > 200 && result.right[0] < 60, `orientation ${result.orientation} right ${result.right}`);
  }

  assert.deepEqual(errors, []);
  console.log('PASS raster decoder: PDF JPEGs ignore Exif orientation');
} finally {
  await browser.close();
}
