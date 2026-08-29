import { createSignal } from 'solid-js';

import { BamReader } from './bam-reader';
import millScene from './mill-scene.bam?url';
import skybox from './skybox.bam?url';

/** Reports progress from the experimental Panda3D BAM scene parser. */
export default function GameShadersForBeginners() {
  const [status, setStatus] = createSignal('Loading the sample BAM scene…', { ownedWrite: true });

  async function loadModel() {
    try {
      const buffer = await (await fetch(millScene)).arrayBuffer();
      const reader = new BamReader(buffer);
      reader.read_object();
      setStatus('The sample scene was parsed successfully. Rendering is still under development.');
    } catch (error) {
      setStatus(`The experimental BAM parser could not load this scene: ${getErrorMessage(error)}`);
    }
  }

  loadModel();

  return (
    <main class="p-6">
      <h1 class="mb-2 text-2xl font-bold">Game Shaders for Beginners</h1>
      <p class="mb-2">Work in progress: this example currently exercises the Panda3D BAM parser.</p>
      <p role="status">{status()}</p>
      <p class="mt-4 text-sm opacity-70">Skybox asset: {skybox}</p>
    </main>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
