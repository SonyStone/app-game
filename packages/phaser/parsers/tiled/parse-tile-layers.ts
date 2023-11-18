import { fromOrientationString } from '../from-orientation-string';
import { CONST } from '../orientation-const';
import { base64Decode } from './base-64-decode';
import { createGroupLayer } from './create-group-layer';
import { parseGID } from './parse-gid';

/**
 * Parses all tilemap layers in a Tiled JSON object into new LayerData objects.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseTileLayers
 * @since 3.0.0
 *
 * @param {object} json - The Tiled JSON object.
 * @param {boolean} insertNull - Controls how empty tiles, tiles with an index of -1, in the map
 * data are handled (see {@link Phaser.Tilemaps.Parsers.Tiled.ParseJSONTiled}).
 *
 * @return {Phaser.Tilemaps.LayerData[]} - An array of LayerData objects, one for each entry in
 * json.layers with the type 'tilelayer'.
 */
export function parseTileLayers(
  json: any,
  insertNull: boolean
): Phaser.Tilemaps.LayerData[] {
  let infiniteMap = json.infinite ?? false;
  const tileLayers: Phaser.Tilemaps.LayerData[] = [];

  // State inherited from a parent group
  let groupStack: any[] = [];
  let curGroupState = createGroupLayer(json);

  while (
    curGroupState.i < curGroupState.layers.length ||
    groupStack.length > 0
  ) {
    if (curGroupState.i >= curGroupState.layers.length) {
      // Ensure recursion stack is not empty first
      if (groupStack.length < 1) {
        console.warn(
          'TilemapParser.parseTiledJSON - Invalid layer group hierarchy'
        );
        break;
      }

      // Return to previous recursive state
      curGroupState = groupStack.pop();
      continue;
    }

    let curl = curGroupState.layers[curGroupState.i];
    curGroupState.i++;

    if (curl.type !== 'tilelayer') {
      if (curl.type === 'group') {
        // Compute next state inherited from group
        let nextGroupState = createGroupLayer(json, curl, curGroupState);

        // Preserve current state before recursing
        groupStack.push(curGroupState);
        curGroupState = nextGroupState;
      }

      // Skip this layer OR 'recurse' (iterative style) into the group
      continue;
    }

    // Base64 decode data if necessary. NOTE: uncompressed base64 only.
    if (curl.compression) {
      console.warn(
        "TilemapParser.parseTiledJSON - Layer compression is unsupported, skipping layer '" +
          curl.name +
          "'"
      );
      continue;
    } else if (curl.encoding && curl.encoding === 'base64') {
      // Chunks for an infinite map
      if (curl.chunks) {
        for (let i = 0; i < curl.chunks.length; i++) {
          curl.chunks[i].data = base64Decode(curl.chunks[i].data);
        }
      }

      // Non-infinite map data
      if (curl.data) {
        curl.data = base64Decode(curl.data);
      }

      delete curl.encoding; // Allow the same map to be parsed multiple times
    }

    //  This is an array containing the tile indexes, one after the other. -1 = no tile,
    //  everything else = the tile index (starting at 1 for Tiled, 0 for CSV) If the map
    //  contains multiple tilesets then the indexes are relative to that which the set starts
    //  from. Need to set which tileset in the cache = which tileset in the JSON, if you do this
    //  manually it means you can use the same map data but a new tileset.

    let layerData;
    let gidInfo;
    let tile;
    let blankTile;

    let output: (Phaser.Tilemaps.Tile | null)[][] = [];
    let x = 0;

    if (infiniteMap) {
      let layerOffsetX = (curl.startx ?? 0) + curl.x;
      let layerOffsetY = (curl.starty ?? 0) + curl.y;

      layerData = new Phaser.Tilemaps.LayerData({
        name: curGroupState.name + curl.name,
        x:
          curGroupState.x + (curl.offsetx ?? 0) + layerOffsetX * json.tilewidth,
        y:
          curGroupState.y +
          (curl.offsety ?? 0) +
          layerOffsetY * json.tileheight,
        width: curl.width,
        height: curl.height,
        tileWidth: json.tilewidth,
        tileHeight: json.tileheight,
        alpha: curGroupState.opacity * curl.opacity,
        visible: curGroupState.visible && curl.visible,
        properties: curl.properties ?? [],
        orientation: fromOrientationString(json.orientation),
      });

      if (layerData.orientation === CONST.HEXAGONAL) {
        layerData.hexSideLength = json.hexsidelength;
        layerData.staggerAxis = json.staggeraxis;
        layerData.staggerIndex = json.staggerindex;
      }

      for (let c = 0; c < curl.height; c++) {
        output[c] = [null];

        for (let j = 0; j < curl.width; j++) {
          output[c][j] = null;
        }
      }

      for (let c = 0, len = curl.chunks.length; c < len; c++) {
        let chunk = curl.chunks[c];

        let offsetX = chunk.x - layerOffsetX;
        let offsetY = chunk.y - layerOffsetY;

        let y = 0;

        for (let t = 0, len2 = chunk.data.length; t < len2; t++) {
          let newOffsetX = x + offsetX;
          let newOffsetY = y + offsetY;

          gidInfo = parseGID(chunk.data[t]);

          //  index, x, y, width, height
          if (gidInfo.gid > 0) {
            tile = new Phaser.Tilemaps.Tile(
              layerData,
              gidInfo.gid,
              newOffsetX,
              newOffsetY,
              json.tilewidth,
              json.tileheight,
              json.tilewidth,
              json.tileheight
            );

            // Turning Tiled's FlippedHorizontal, FlippedVertical and FlippedAntiDiagonal
            // propeties into flipX, flipY and rotation
            tile.rotation = gidInfo.rotation;
            tile.flipX = gidInfo.flipped;

            output[newOffsetY][newOffsetX] = tile;
          } else {
            blankTile = insertNull
              ? null
              : new Phaser.Tilemaps.Tile(
                  layerData,
                  -1,
                  newOffsetX,
                  newOffsetY,
                  json.tilewidth,
                  json.tileheight,
                  json.tilewidth,
                  json.tileheight
                );

            output[newOffsetY][newOffsetX] = blankTile;
          }

          x++;

          if (x === chunk.width) {
            y++;
            x = 0;
          }
        }
      }
    } else {
      layerData = new Phaser.Tilemaps.LayerData({
        name: curGroupState.name + curl.name,
        x: curGroupState.x + (curl.offsetx ?? 0) + curl.x,
        y: curGroupState.y + (curl.offsety ?? 0) + curl.y,
        width: curl.width,
        height: curl.height,
        tileWidth: json.tilewidth,
        tileHeight: json.tileheight,
        alpha: curGroupState.opacity * curl.opacity,
        visible: curGroupState.visible && curl.visible,
        properties: curl.properties ?? [],
        orientation: fromOrientationString(json.orientation),
      });

      if (layerData.orientation === CONST.HEXAGONAL) {
        layerData.hexSideLength = json.hexsidelength;
        layerData.staggerAxis = json.staggeraxis;
        layerData.staggerIndex = json.staggerindex;
      }
      let row = [];

      //  Loop through the data field in the JSON.
      for (let k = 0, len = curl.data.length; k < len; k++) {
        gidInfo = parseGID(curl.data[k]);

        //  index, x, y, width, height
        if (gidInfo.gid > 0) {
          tile = new Phaser.Tilemaps.Tile(
            layerData,
            gidInfo.gid,
            x,
            output.length,
            json.tilewidth,
            json.tileheight,
            json.tilewidth,
            json.tileheight
          );

          // Turning Tiled's FlippedHorizontal, FlippedVertical and FlippedAntiDiagonal
          // propeties into flipX, flipY and rotation
          tile.rotation = gidInfo.rotation;
          tile.flipX = gidInfo.flipped;

          row.push(tile);
        } else {
          blankTile = insertNull
            ? null
            : new Phaser.Tilemaps.Tile(
                layerData,
                -1,
                x,
                output.length,
                json.tilewidth,
                json.tileheight,
                json.tilewidth,
                json.tileheight
              );
          row.push(blankTile);
        }

        x++;

        if (x === curl.width) {
          output.push(row);
          x = 0;
          row = [];
        }
      }
    }

    layerData.data = output as any;
    tileLayers.push(layerData);
  }

  return tileLayers;
}
