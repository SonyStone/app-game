import { BamReader } from './bam-reader';
import millScene from './mill-scene.bam?url';
import skybox from './skybox.bam?url';

export default function GameShadersForBeginners() {
  async function loadModel() {
    console.clear();

    console.log(millScene);
    console.log(skybox);

    // I tryed, but I need to know C++ a little bit better
    const buffer = await (await (await fetch(millScene)).blob()).arrayBuffer();

    const reader = new BamReader(buffer);
    reader.read_object();
  }
  loadModel();

  return <></>;
}
