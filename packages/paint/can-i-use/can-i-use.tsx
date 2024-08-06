import { For, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import CanIUseWorker from './can-i-use.worker?worker';

export default function CanIUse() {
  const worker = new CanIUseWorker();
  const [features, setFeatures] = createStore({
    canvas2d: (() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('2d');
      return !!gl;
    })(),
    webgl: (() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      return !!gl;
    })(),
    webgl2: (() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return !!gl;
    })(),
    webgpu: false,
    'canvas2d OffscreenCanvas': (() => {
      const canvas = new OffscreenCanvas(4, 4);
      const gl = canvas.getContext('2d');
      return !!gl;
    })(),
    'webgl OffscreenCanvas': (() => {
      const canvas = new OffscreenCanvas(4, 4);
      const gl = canvas.getContext('webgl');
      return !!gl;
    })(),
    'webgl2 OffscreenCanvas': (() => {
      const canvas = new OffscreenCanvas(4, 4);
      const gl = canvas.getContext('webgl2');
      return !!gl;
    })(),
    'webgpu OffscreenCanvas': false,
    'canvas2d OffscreenCanvas worker': false,
    'webgl OffscreenCanvas worker': false,
    'webgl2 OffscreenCanvas worker': false,
    'webgpu OffscreenCanvas worker': false
  });

  const webgpu = (async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    return !!device;
  })();
  webgpu.then((supports) => {
    setFeatures('webgpu', supports);
  });

  worker.onmessage = (ev) => {
    const { type, supports } = ev.data;
    setFeatures(`${type} OffscreenCanvas worker` as any, supports);
    setFeatures(`${type} OffscreenCanvas` as any, supports);
  };

  onCleanup(() => {
    worker.terminate();
  });

  return (
    <>
      <div class="flex p-4">
        <table class="border-separate border-spacing-2">
          <thead>
            <tr>
              <th class="text-start">Feature</th>
              <th>Support</th>
            </tr>
          </thead>
          <tbody>
            <For each={Object.entries(features)}>
              {([key, value]) => (
                <tr>
                  <th class="text-start">{key}</th>
                  <td>{value ? 'yes' : 'no'}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </>
  );
}
