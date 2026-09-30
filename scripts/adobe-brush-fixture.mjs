import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Returns the bytes of an Adobe brush pack, downloading it once into the ignored `.tmp/adobe-brushes` cache.
 *
 * Every file is pinned by SHA-256 in `adobe-brush-fixtures.json`; cached and downloaded bytes that differ are rejected,
 * so a replaced upstream file fails loudly instead of silently changing test expectations. Downloads time out after
 * `ADOBE_BRUSH_TIMEOUT_MS` (default 10 minutes; the Megapack is 375 MB). Concurrent callers share one download: callers
 * in the same process await the same promise, and other processes (parallel test workers) wait on a lock file.
 */
export function readAdobeBrushFixture(filename) {
  const expected = adobeBrushFixtureDigests[filename];

  if (!expected) {
    return Promise.reject(new Error(`Adobe fixture ${filename} is not pinned in scripts/adobe-brush-fixtures.json`));
  }

  let pending = inFlight.get(filename);

  if (!pending) {
    pending = readPinned(filename, expected).finally(() => inFlight.delete(filename));
    inFlight.set(filename, pending);
  }

  return pending;
}

/** Pinned SHA-256 digests by filename. CI keys its fixture cache on this file. */
export const adobeBrushFixtureDigests = JSON.parse(
  readFileSync(new URL('./adobe-brush-fixtures.json', import.meta.url), 'utf8')
);

/** Absolute path of the ignored fixture cache; derived fixtures may be stored in subdirectories. */
export const adobeBrushCacheDirectory = fileURLToPath(new URL('../.tmp/adobe-brushes/', import.meta.url));

const inFlight = new Map();
const timeoutMs = Number(process.env.ADOBE_BRUSH_TIMEOUT_MS ?? 10 * 60 * 1000);

async function readPinned(filename, expected) {
  const path = `${adobeBrushCacheDirectory}${filename}`;
  const cached = await readVerified(path, filename, expected);

  if (cached) {
    return cached;
  }

  await mkdir(adobeBrushCacheDirectory, { recursive: true });
  const lock = await acquireLock(`${path}.lock`);

  try {
    // Another process may have finished the download while this one waited for the lock.
    return (await readVerified(path, filename, expected)) ?? (await download(path, filename, expected));
  } finally {
    await lock.release();
  }
}

/** Returns verified cached bytes, `undefined` when absent, and throws when the cached file does not match its pin. */
async function readVerified(path, filename, expected) {
  let bytes;

  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }

  const actual = sha256(bytes);

  if (actual !== expected) {
    throw new Error(
      `Adobe fixture ${filename}: cached file ${path} has SHA-256 ${actual}, expected ${expected}. Delete it to download again.`
    );
  }

  return bytes;
}

async function download(path, filename, expected) {
  const url = `https://download.adobe.com/pub/adobe/photoshop/brushes/${filename}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch((error) => {
    throw new Error(`Adobe fixture ${filename}: download from ${url} failed`, { cause: error });
  });

  if (!response.ok) {
    throw new Error(`Adobe fixture ${filename}: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);

  if (actual !== expected) {
    throw new Error(`Adobe fixture ${filename}: downloaded SHA-256 ${actual}, expected ${expected}`);
  }

  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return bytes;
}

/**
 * Creates `path` exclusively and returns its release. While another process holds it, polls until it is removed; a
 * lock older than the download timeout belonged to a crashed process and is taken over.
 */
async function acquireLock(path) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const handle = await open(path, 'wx');
      await handle.close();
      return { release: () => rm(path, { force: true }) };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    const age = await stat(path).then(
      (info) => Date.now() - info.mtimeMs,
      () => 0
    );

    if (age > timeoutMs) {
      await rm(path, { force: true });
      continue;
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for another process to download ${path.replace(/\.lock$/, '')}`);
    }

    await delay(250);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
