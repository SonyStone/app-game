/**
 * Master list of tiles -> x, y, index in tileset.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.BuildTilesetIndex
 * @since 3.0.0
 *
 * @param {Phaser.Tilemaps.MapData} mapData - The Map Data object.
 *
 * @return {array} An array of Tileset objects.
 */
export function buildTilesetIndex(mapData: Phaser.Tilemaps.MapData) {
  let i;
  let set;
  let tiles = [];

  for (i = 0; i < mapData.imageCollections.length; i++) {
    let collection = mapData.imageCollections[i];
    let images = collection.images;

    for (let j = 0; j < images.length; j++) {
      let image = images[j];

      set = new Phaser.Tilemaps.Tileset(
        image.image,
        image.gid,
        collection.imageWidth,
        collection.imageHeight,
        0,
        0
      );

      set.updateTileData(collection.imageWidth, collection.imageHeight);

      mapData.tilesets.push(set);
    }
  }

  for (i = 0; i < mapData.tilesets.length; i++) {
    set = mapData.tilesets[i];

    let x = set.tileMargin;
    let y = set.tileMargin;

    let count = 0;
    let countX = 0;
    let countY = 0;

    for (let t = set.firstgid; t < set.firstgid + set.total; t++) {
      //  Can add extra properties here as needed
      tiles[t] = [x, y, i];

      x += set.tileWidth + set.tileSpacing;

      count++;

      if (count === set.total) {
        break;
      }

      countX++;

      if (countX === set.columns) {
        x = set.tileMargin;
        y += set.tileHeight + set.tileSpacing;

        countX = 0;
        countY++;

        if (countY === set.rows) {
          break;
        }
      }
    }
  }

  return tiles;
}
