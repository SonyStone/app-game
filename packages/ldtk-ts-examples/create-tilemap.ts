import { Level } from "@/ldtk-ts/typedef";
import { Scene } from "phaser";

export function createTilemap(this: Scene, level: Level) {
  const layers: Phaser.Tilemaps.LayerData[] = [];
  for (const layerInstance of level.layerInstances!) {
    const {
      __identifier: name,
      __cWid: width,
      __cHei: height,
      __gridSize: tileWidth,
      __gridSize: tileHeight,
      autoLayerTiles,
    } = layerInstance;

    const layerData = new Phaser.Tilemaps.LayerData({
      name,
      tileWidth,
      tileHeight,
    });

    const data: (Phaser.Tilemaps.Tile | null)[][] = [];
    for (let x = 0; x <= height + 2; x++) {
      data.push([]);
      for (let y = 0; y <= width + 2; y++) {
        data[x][y] = null;
      }
    }

    for (let index = 0; index < autoLayerTiles.length; index++) {
      const { t, f, px } = autoLayerTiles[index];
      const x = px[0] / tileWidth;
      const y = px[1] / tileHeight;
      const tile = new Phaser.Tilemaps.Tile(
        layerData,
        t,
        x,
        y,
        tileWidth,
        tileHeight,
        tileWidth,
        tileHeight
      );

      tile.flipX = f === 1 || f === 3 ? true : false;
      tile.flipY = f === 2 || f === 3 ? true : false;

      data[y][x] = tile;
    }

    layerData.data = data as any;

    layers.push(layerData);
  }

  const {
    __cWid: width,
    __cHei: height,
    __gridSize: tileWidth,
    __gridSize: tileHeight,
  } = level.layerInstances![0];

  const layerData = layers[0];

  const mapData = new Phaser.Tilemaps.MapData({
    name: "",
    width,
    height,
    tileWidth,
    tileHeight,
    orientation: Phaser.Tilemaps.Orientation.ORTHOGONAL,
    layers,
    objects: [],
  });

  mapData.width = layerData.width = width;
  mapData.height = layerData.height = height;
  mapData.widthInPixels = layerData.widthInPixels = width * tileWidth;
  mapData.heightInPixels = layerData.heightInPixels = height * tileHeight;

  const tilemap = new Phaser.Tilemaps.Tilemap(this, mapData);

  tilemap.format = 2;

  return tilemap;
}
