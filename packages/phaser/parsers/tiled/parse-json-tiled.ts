import { deepCopy } from '../deep-copy';
import { fromOrientationString } from '../from-orientation-string';
import { CONST } from '../orientation-const';
import { assignTileProperties } from './assign-tile-properties';
import { buildTilesetIndex } from './build-tileset-index';
import { parseImageLayers } from './parse-image-layers';
import { parseObjectLayers } from './parse-object-layers';
import { parseTileLayers } from './parse-tile-layers';
import { parseTilesets } from './parse-tilesets';

/**
 * Parses a Tiled JSON object into a new MapData object.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseJSONTiled
 * @since 3.0.0
 *
 * @param {string} name - The name of the tilemap, used to set the name on the MapData.
 * @param {object} source - The original Tiled JSON object. This is deep copied by this function.
 * @param {boolean} insertNull - Controls how empty tiles, tiles with an index of -1, in the map
 * data are handled. If `true`, empty locations will get a value of `null`. If `false`, empty
 * location will get a Tile object with an index of -1. If you've a large sparsely populated map and
 * the tile data doesn't need to change then setting this value to `true` will help with memory
 * consumption. However if your map is small or you need to update the tiles dynamically, then leave
 * the default value set.
 *
 * @return {?Phaser.Tilemaps.MapData} The created MapData object, or `null` if the data can't be parsed.
 */
export function parseJSONTiled(
  name: string,
  source: any,
  insertNull: boolean
): Phaser.Tilemaps.MapData | undefined {
  let json = deepCopy(source);

  //  Map data will consist of: layers, objects, images, tilesets, sizes
  let mapData = new Phaser.Tilemaps.MapData({
    width: json.width,
    height: json.height,
    name: name,
    tileWidth: json.tilewidth,
    tileHeight: json.tileheight,
    orientation: fromOrientationString(json.orientation),
    format: Phaser.Tilemaps.Formats.TILED_JSON,
    version: json.version,
    properties: json.properties,
    renderOrder: json.renderorder,
    infinite: json.infinite,
  });

  if (mapData.orientation === CONST.HEXAGONAL) {
    mapData.hexSideLength = json.hexsidelength;
    mapData.staggerAxis = json.staggeraxis;
    mapData.staggerIndex = json.staggerindex;
  }

  mapData.layers = parseTileLayers(json, insertNull);
  mapData.images = parseImageLayers(json);

  let sets = parseTilesets(json);

  mapData.tilesets = sets.tilesets;
  mapData.imageCollections = sets.imageCollections;

  mapData.objects = parseObjectLayers(json);

  mapData.tiles = buildTilesetIndex(mapData);

  assignTileProperties(mapData);

  return mapData;
}
