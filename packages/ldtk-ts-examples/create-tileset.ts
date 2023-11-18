import { TilesetDefinition } from "@/ldtk-ts/typedef";
import { Scene } from "phaser";

/** addTilesetImage */
export function createTileset(
  this: Scene,
  tilesetDefinition: TilesetDefinition,
  imgKey: string
) {
  const {
    pxWid: width,
    pxHei: height,
    identifier,
    tileGridSize: tileWidth,
    tileGridSize: tileHeight,
  } = tilesetDefinition;

  const tileset = new Phaser.Tilemaps.Tileset(
    imgKey,
    0,
    tileWidth,
    tileHeight,
    0,
    0,
    {},
    {},
    { x: 0, y: 0 }
  );

  const texture = this.sys.textures.get(imgKey);
  tileset.setImage(texture);

  return tileset;
}
