import { overpassToMap, type OsmArea } from './osm';

/**
 * Area of the bundled Overpass reply `fixtures/overpass-borovitskaya.json`: 300 m around
 * Borovitskaya Square, from Volkhonka to the Moskva river, as on the 2017 sketch
 * `arts/chrome_2017-12-13_23-59-58.png`. Fetched on 2026-10-24 with `overpassQuery`.
 */
export const SAMPLE_AREA: OsmArea = { lat: 55.7482, lon: 37.6092, sizeMeters: 300 };

/** Imports the bundled reply, so the editor works without the network. Loads it on demand. */
export async function loadSampleMap() {
  const reply = await import('./fixtures/overpass-borovitskaya.json');

  return overpassToMap(reply.default, SAMPLE_AREA, 'Borovitskaya Square');
}
