import { createEffect, createSignal } from 'solid-js';

export const createWebGPUDevice = () => {
  const [device, setDevice] = createSignal<GPUDevice | undefined>(undefined);

  const getDevice = async () => {
    if (!navigator.gpu) {
      console.error('this browser does not support WebGPU');
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.error('this browser supports webgpu but it appears disabled');
      return;
    }

    const device = await adapter?.requestDevice();

    return device;
  };

  createEffect(async () => {
    setDevice(await getDevice());
  });

  createEffect(async () => {
    const info = await device()?.lost;
    if (!info) {
      return;
    }
    console.error(`WebGPU device was lost: ${info.message}`);
    // 'reason' will be 'destroyed' if we intentionally destroy the device.
    if (info.reason !== 'destroyed') {
      // try again
      setDevice(await getDevice());
    }
  });

  return device;
};
