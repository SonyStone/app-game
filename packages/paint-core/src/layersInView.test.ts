import { expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { layersInView } from './layersInView';

it('finds the layers with tiles in the view, by their tile keys rather than their extent', () => {
  const layer = (id: string, keys: string[]) => ({ id, tiles: new Map(keys.map((key) => [key, new Uint8Array(0)])) });
  const layers = [
    layer('here', ['0,0']),
    // Two drawings far apart on either side of the view, none in it.
    layer('around', ['-40,0', '40,0']),
    layer('empty', []),
    layer(
      'dense',
      Array.from({ length: 400 }, (_, index) => `${(index % 20) - 10},${Math.floor(index / 20) - 10}`)
    )
  ];
  const size = { width: 800, height: 600 };
  expect(layersInView(layers, defaultCamera(), size)).toEqual(['here', 'dense']);
  expect(layersInView(layers, { ...defaultCamera(), x: 40 * 256 + 128 }, size)).toEqual(['around']);
  expect(layersInView(layers, { ...defaultCamera(), zoom: 0.02 }, size)).toEqual(['here', 'around', 'dense']);
});
