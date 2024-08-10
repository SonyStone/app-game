onmessage = (ev) => {
  console.log(`message!`, ev);
};

{
  const canvas = new OffscreenCanvas(4, 4);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  postMessage({ type: 'canvas2d', supports: !!ctx });
}

{
  const canvas = new OffscreenCanvas(4, 4);
  const ctx = canvas.getContext('webgl');
  postMessage({ type: 'webgl', supports: !!ctx });
}

{
  const canvas = new OffscreenCanvas(4, 4);
  const ctx = canvas.getContext('webgl2');
  postMessage({ type: 'webgl2', supports: !!ctx });
}

{
  const webgpu = (async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    return !!device;
  })();
  webgpu.then((supports) => {
    postMessage({ type: 'webgpu', supports });
  });
}
