import tgpu from 'typegpu';
import { createSmudgePickup } from './smudgePickup';

/** Checks actual GPU recurrence, alpha, diameter changes and stroke reset without involving document storage. */
export async function verifySmudgePickup(report: (message: string) => void) {
  const root = await tgpu.init();
  const pickup = createSmudgePickup(root);
  const texture = root.createTexture({ size: [8, 8], format: 'rgba8unorm' }).$usage('sampled', 'render');
  const smallTexture = root.createTexture({ size: [4, 4], format: 'rgba8unorm' }).$usage('sampled', 'render');
  const staging = root.device.createBuffer({ size: 8 * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const patch = (color: readonly number[], size = 8, pixelsWide = 8) => {
    const source = pixelsWide === 4 ? smallTexture : texture;
    const pixels = new Uint8Array(pixelsWide * pixelsWide * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
    root.device.queue.writeTexture({ texture: root.unwrap(source) }, pixels, { bytesPerRow: pixelsWide * 4 }, [
      pixelsWide,
      pixelsWide
    ]);
    return {
      texture: source,
      width: pixelsWide,
      height: pixelsWide,
      region: { x: 100 - size / 2, y: 100 - size / 2, width: size, height: size }
    };
  };
  const read = async (result: ReturnType<typeof pickup.step>) => {
    const encoder = root.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: root.unwrap(result.texture) },
      { buffer: staging, bytesPerRow: 256 },
      [8, 8]
    );
    root.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const pixels = new Uint8Array(staging.getMappedRange()).slice();
    staging.unmap();
    return (x: number, y = 4) => [...pixels.subarray(y * 256 + x * 4, y * 256 + x * 4 + 4)];
  };
  const check = (actual: number[], expected: number[], label: string, tolerance = 1) => {
    if (actual.some((value, i) => Math.abs(value - expected[i]!) > tolerance))
      throw new Error(`${label}: ${actual.join(',')} expected ${expected.join(',')}`);
  };
  try {
    pickup.step(patch([255, 0, 0, 255]), 0.9, false);
    let result = pickup.step(patch([0, 0, 255, 255]), 0.9, false);
    check((await read(result))(4), [230, 0, 26, 255], 'Retain 90% of first pickup');
    result = pickup.step(patch([0, 255, 0, 255]), 0.9, false);
    check((await read(result))(4), [207, 26, 23, 255], 'Carry previous mixture, not previous canvas');
    result = pickup.step(patch([0, 0, 0, 0]), 0.5, false);
    check((await read(result))(4), [104, 13, 12, 128], 'Premultiplied transparent pickup');
    pickup.reset();
    pickup.step(patch([255, 0, 0, 255], 4), 1, false);
    result = pickup.step(patch([0, 0, 255, 255], 8), 1, false);
    const grown = await read(result);
    check(grown(4), [255, 0, 0, 255], 'Grown brush retains center');
    check(grown(0), [0, 0, 255, 255], 'Grown brush captures fresh rim');
    if (result.clip.join(',') !== '0.25,0.25,0.75,0.75') throw new Error('Grown brush lost overlap clipping.');
    pickup.reset();
    pickup.step(patch([255, 0, 0, 255]), 1, false);
    pickup.step(patch([0, 0, 255, 255], 4, 4), 1, false);
    result = pickup.step(patch([0, 255, 0, 255]), 1, false);
    const resized = await read(result);
    check(resized(2, 2), [255, 0, 0, 255], 'Reused allocation samples active smaller bank');
    check(resized(5, 5), [255, 0, 0, 255], 'Smaller bank retains entire active extent');
    check(resized(0), [0, 255, 0, 255], 'Reused allocation captures fresh expanded rim');
    pickup.reset();
    result = pickup.step(patch([0, 255, 0, 255]), 1, false);
    check((await read(result))(4), [0, 255, 0, 255], 'Reset does not carry paint from prior stroke');
    pickup.reset();
    pickup.step(patch([255, 0, 0, 255]), 0.5, true);
    result = pickup.step(patch([0, 255, 0, 255]), 0.5, true);
    check((await read(result))(4), [188, 188, 0, 255], 'Smooth color uses linear pickup mixing');
    pickup.reset();
    pickup.step(patch([0, 0, 0, 0]), 1, false, [0, 0, 1]);
    result = pickup.step(patch([0, 0, 0, 0]), 1, false);
    check((await read(result))(4), [0, 0, 255, 255], 'Finger Painting seeds carried foreground');
    for (let i = 0; i < 100; i++) pickup.step(patch([0, 255, 0, 255]), 0.9, false);
    if (pickup.bytes() !== 2 * 8 * 8 * 4) throw new Error('Smudge banks grew with stroke length.');
    report(
      'Smudge GPU banks: persistent mixture, transparency, resize overlap, reset, Smooth color, Finger Painting and bounded reuse passed.'
    );
  } finally {
    staging.destroy();
    texture.destroy();
    smallTexture.destroy();
    pickup.destroy();
    root.destroy();
  }
}
