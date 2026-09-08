import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCmykProfile } from '../../chroma/io/cmyk/cmykProfile';
import native from '../fixtures/photoshop-profile-colors.json';

/** Checks the actual WASM converter against Photoshop's retained RGB/8 pixels.
 * Supply the local USWebCoatedSWOP.icc path; Adobe's profile is not redistributed with the tests.
 */
async function verify() {
  const path = process.argv[2];
  if (!path) throw new Error('Pass the local U.S. Web Coated (SWOP) v2 ICC profile path.');
  const bytes = readFileSync(path);
  const profile = await createCmykProfile(bytes);
  try {
    assert.equal(profile.name, 'U.S. Web Coated (SWOP) v2');
    const rows = native.cases
      .filter((row) => row.model === 'CMYK')
      .map((row) => {
        const channels = row.channels as [number, number, number, number];
        const actual = profile.convert(channels);
        const expected = row.pixel.map(Math.round);
        const maximumError = Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)));
        assert(maximumError <= 3, `Native mismatch for ${channels}: ${actual} vs ${expected}`);
        return { channels, actual, expected, maximumError };
      });
    assert.throws(() => profile.convert([NaN, 0, 0, 0]));
    assert.throws(() => profile.convert([0, 0, 0, 101]));
    await assert.rejects(createCmykProfile(new Uint8Array(128)));
    await assert.rejects(createCmykProfile(new Uint8Array(127)));
    console.log(
      JSON.stringify(
        { sourceSha256: createHash('sha256').update(bytes).digest('hex'), profile: profile.name, rows },
        null,
        2
      )
    );
  } finally {
    profile.dispose();
  }
  profile.dispose();
  assert.throws(() => profile.convert([0, 0, 0, 0]), /disposed/);
  // Reopening after native handles have been closed must preserve transform ownership.
  const replacement = await createCmykProfile(bytes);
  try {
    assert.deepEqual(replacement.convert([0, 0, 0, 100]), [35, 31, 32]);
  } finally {
    replacement.dispose();
  }
}
await verify();
