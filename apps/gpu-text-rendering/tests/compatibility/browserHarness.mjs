/** Installs the real conversion/renderer pipeline in an isolated browser page. */
export async function installHarness() {
  const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
  const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
  const { layoutPages } = await import('/src/features/document/document.ts');
  const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
  const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
  const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
  let encoded;
  let current;

  window.compatibility = {
    async open() {
      const started = performance.now();
      const bytes = await (await fetch('/compatibility-input.pdf')).arrayBuffer();
      const converted = await convertPdf(bytes, AbortSignal.timeout(75_000));

      if (converted.isErr()) {
        return { ok: false, stage: 'convert', error: converted.error, elapsedMs: performance.now() - started };
      }

      encoded = converted.value;
      const result = await this.prepare();
      return { ...result, elapsedMs: performance.now() - started, gdocBytes: encoded.byteLength };
    },

    async prepare(url) {
      this.dispose();
      const decoded = await readGdoc(url ?? encoded.slice(0));

      if (decoded.isErr()) {
        return { ok: false, stage: 'decode', error: decoded.error };
      }

      const data = decoded.value;
      const doc = {
        ...data,
        pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
        images: new Map(),
        imageVertices: new ArrayBuffer(0)
      };
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      document.body.append(canvas);
      const { gpu, dispose } = await mountRenderingGpu(
        canvas,
        Math.max(data.curves.byteLength, data.instances.byteLength)
      );
      current = { canvas, gpu, dispose, doc };
      const preparation = new AbortController();
      const deadline = setTimeout(() => preparation.abort(), 75_000);
      const prepared = await createTypeGpuRenderer(gpu, doc, preparation.signal);
      clearTimeout(deadline);

      if (prepared.isErr()) {
        this.dispose();
        return { ok: false, stage: 'prepare', error: prepared.error };
      }

      current.renderer = prepared.value;
      return {
        ok: true,
        pages: doc.pages.map(({ width, height }) => ({ width, height })),
        resourceBytes: prepared.value.resourceBytes
      };
    },

    async draw(index, width, height) {
      const { doc, canvas, renderer } = current;
      const target = doc.pages[index];
      const first = doc.pages[0];
      canvas.width = width;
      canvas.height = height;
      const camera = {
        x: target.width / first.width / 2 - target.x,
        y: 1 - target.height / first.height / 2 - target.y,
        zoom: target.height / (2 * first.width),
        rotation: 0
      };
      const rendered = renderer.render(createFrame(doc, camera, width, height));

      if (rendered.isErr()) {
        return { ok: false, error: rendered.error };
      }

      const settled = await renderer.settle();

      if (settled.isErr()) {
        return { ok: false, error: settled.error };
      }

      return { ok: true, resourceBytes: renderer.resourceBytes };
    },

    async download() {
      const url = URL.createObjectURL(new Blob([encoded]));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'document.gdoc';
      anchor.click();
      // The test closes the page after saving the download, which releases its blob URL.
    },

    dispose() {
      if (current) {
        current.renderer?.destroy();
        current.dispose();
        current.canvas.remove();
        current = undefined;
      }
    }
  };
}
