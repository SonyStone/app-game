import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';
import { snapshotDocument } from './storage';
import { createTileStore } from './tileStore';
import { createVirtualPages } from './virtualPages';

/** Real database reopen and close-zoom painting checks. A tiny RAM budget forces reads from disk. */
export async function verifyPersistentOverview(report: (message: string) => void) {
  await verifyLegacyOverview(report);
  const name = `paint-overview-qa-${crypto.randomUUID()}`;
  let store = await createTileStore(name, 1024);
  const document = createDocument({ paged: true });
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([40, 120, 180, 255], i);
  for (let y = -8; y < 8; y++)
    for (let x = -8; x < 8; x++) document.active.tiles.set(`${x},${y}`, store.capture(pixels.slice()));
  let canvas = new OffscreenCanvas(512, 512);
  const errors: string[] = [];
  const makeRenderer = () =>
    createPaintRenderer(canvas, (error) => errors.push(error), {
      virtualTexture: true,
      readTile: store.read,
      overviewStorage: store.overviews,
      onError: (error) => errors.push(String(error))
    });
  let renderer = await makeRenderer();
  const size = { width: 512, height: 512 };
  const camera = { ...defaultCamera(), x: 128, y: 128, zoom: 0.05 };
  const save = () => store.save(snapshotDocument(document.layers, document.active.id, camera));
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  try {
    await renderer.prepareOverview(document.layers);
    await save();
    report(
      `PASS: initial 64 MiB drawing saves ${store.stats().overviewWrites} derived pages with high-resolution tile versions`
    );
    renderer.destroy();
    await store.close();
    store = await createTileStore(name, 1024);
    const previous = await store.load();
    assert(previous, 'Missing drawing checkpoint');
    document.replace(previous!.layers, previous!.activeId);
    canvas = new OffscreenCanvas(512, 512);
    renderer = await makeRenderer();
    const start = performance.now();
    await renderer.prepareOverview(document.layers);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    assert(
      store.stats().reads === 0 && store.stats().overviewReads > 0,
      `Reopening decoded high resolution: ${JSON.stringify(store.stats())}`
    );
    assert(renderer.stats().virtual!.builtPages === 0, 'Reopening rebuilt saved overview pixels');
    const base = await center(canvas);
    assert(base[0] === 40 && base[1] === 120, `Reopened overview color mismatch: ${base}`);
    report(
      `PASS: reopened first 5% frame in ${(performance.now() - start).toFixed(1)} ms; ${store.stats().overviewReads} low-res reads, zero high-res reads and zero rebuilt pages`
    );
    camera.zoom = 4;
    await renderer.render(document.layers, camera, size, 1, true);
    renderer.begin(document.active, { ...defaultBrush(), color: '#00ff00', hardness: 1, opacity: 1 });
    await renderer.paint([{ x: 128, y: 128, radius: 48, flow: 1 }]);
    document.commit(await renderer.finish());
    document.persist(store.capture);
    const beforeBuilt = renderer.stats().virtual!.builtPages;
    const beforeReads = store.stats().reads;
    await renderer.prepareOverview(document.layers);
    const rebuilt = renderer.stats().virtual!.builtPages - beforeBuilt;
    const readDelta = store.stats().reads - beforeReads;
    assert(
      rebuilt === 4 && readDelta <= 4,
      `Small stroke rebuilt unrelated source data: ${rebuilt} pages / ${readDelta} reads`
    );
    camera.zoom = 0.05;
    const readsAtZoomOut = store.stats().reads;
    for (const dpr of [1, 2]) {
      await renderer.render(document.layers, camera, size, dpr);
      await renderer.submitted();
      const painted = await center(canvas);
      assert(
        painted[1]! > 240 && painted[0]! < 15,
        `First zoom-out frame missed the new close-zoom stroke at DPR ${dpr}: ${painted}`
      );
      assert(
        renderer.debugPages().every((page) => page.resident),
        'First zoom-out had missing pages'
      );
      assert(store.stats().reads === readsAtZoomOut, 'Zoom-out read high-resolution data');
    }
    await save();
    report(
      `PASS: draw at 400% → first frame at 5% includes the new stroke at DPR 1 and 2; ${rebuilt} derived pages updated, ${readDelta} high-res reads`
    );
    document.undo();
    renderer.reset();
    const readsBeforeUndo = store.stats().reads;
    await renderer.prepareOverview(document.layers);
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    assert((await center(canvas))[0] === base[0], 'Undo reused stale low-resolution paint');
    assert(store.stats().reads === readsBeforeUndo, 'Undo rebuilt an already saved overview');
    await store.collect(document.snapshots());
    assert(!errors.length, errors.join('\n'));
    report(
      'PASS: undo restores the old stored overview without reading high-resolution pixels; garbage collection preserves current roots'
    );
    report('ALL PERSISTENT OVERVIEW CHECKS PASSED');
  } finally {
    renderer.destroy();
    await store.close();
    indexedDB.deleteDatabase(name);
  }
}

/** An existing array checkpoint must acquire stable source IDs on its first migration. */
async function verifyLegacyOverview(report: (message: string) => void) {
  const name = `paint-overview-migration-${crypto.randomUUID()}`;
  const document = createDocument({ paged: true });
  document.active.tiles.set('0,0', new Uint8Array(256 * 256 * 4).fill(120));
  const camera = { ...defaultCamera(), zoom: 0.05 };
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents');
      request.result.createObjectStore('tiles');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction('documents', 'readwrite');
    tx.objectStore('documents').put(snapshotDocument(document.layers, document.active.id, camera), 'current');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
  legacy.close();
  let store = await createTileStore(name, 1024);
  try {
    const saved = (await store.load())!;
    document.replace(saved.layers, saved.activeId);
    document.persist(store.capture);
    let pages = createVirtualPages(store.read, 1024, store.overviews);
    pages.sync(document.layers);
    const roots = pages.overview(document.active.id, 4);
    await pages.retain(roots);
    const before = await pages.pagePixels(roots[0]!);
    await store.save(snapshotDocument(document.layers, document.active.id, camera));
    await store.close();
    store = await createTileStore(name, 1024);
    const migrated = (await store.load())!;
    document.replace(migrated.layers, migrated.activeId);
    document.persist(store.capture);
    pages = createVirtualPages(store.read, 1024, store.overviews);
    pages.sync(document.layers);
    const after = await pages.pagePixels(roots[0]!);
    if (after.some((byte, i) => byte !== before[i]) || store.stats().reads || pages.stats().builtPages)
      throw new Error('Legacy migration lost pixels or rebuilt its overview on the second open');
    report('PASS: legacy IndexedDB v2 drawing migrates once; second open reuses saved low-res with identical pixels');
  } finally {
    await store.close();
    indexedDB.deleteDatabase(name);
  }
}

async function center(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(await canvas.convertToBlob());
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data];
}
