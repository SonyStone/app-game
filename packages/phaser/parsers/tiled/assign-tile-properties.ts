/**
 * Copy properties from tileset to tiles.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.AssignTileProperties
 * @since 3.0.0
 *
 * @param {Phaser.Tilemaps.MapData} mapData - The Map Data object.
 */
export function assignTileProperties(mapData: Phaser.Tilemaps.MapData) {
  let layerData;
  let tile;
  let sid;
  let set;
  let row;

  // go through each of the map data layers
  for (
    let i = 0;
    i < (mapData.layers as Phaser.Tilemaps.LayerData[]).length;
    i++
  ) {
    layerData = (mapData.layers as Phaser.Tilemaps.LayerData[])[i];

    set = null;

    // rows of tiles
    for (let j = 0; j < layerData.data.length; j++) {
      row = layerData.data[j];

      // individual tiles
      for (let k = 0; k < row.length; k++) {
        tile = row[k];

        if (tile === null || tile.index < 0) {
          continue;
        }

        // find the relevant tileset
        sid = mapData.tiles[tile.index][2];
        set = mapData.tilesets[sid];

        // Ensure that a tile's size matches its tileset
        tile.width = set.tileWidth;
        tile.height = set.tileHeight;

        // if that tile type has any properties, add them to the tile object
        if (
          set.tileProperties &&
          (set.tileProperties as any)[tile.index - set.firstgid]
        ) {
          tile.properties = Object.assign(
            tile.properties,
            (set.tileProperties as any)[tile.index - set.firstgid]
          );
        }
      }
    }
  }
}
