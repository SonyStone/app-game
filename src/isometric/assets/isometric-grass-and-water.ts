import map from './isometric-grass-and-water.json?url';
import tiles from './isometric-grass-and-water.png';

export default {
  map,
  tiles,
};

export interface TilesMap {
  height: number;
  layers: {
    data: number[];
    height: number;
    name: string;
    opacity: number;
    type: string;
    visible: boolean;
    width: number;
    x: number;
    y: number;
  }[];
  nextobjectid: number;
  orientation: string;
  properties: {};
  renderorder: string;
  spritesheet: {
    frames: {
      [key: string]: {
        frame: { x: number; y: number; w: number; h: number };
        pivot: { x: number; y: number };
        rotated: boolean;
        sourceSize: { w: number; h: number };
        spriteSourceSize: { x: number; y: number; w: number; h: number };
        trimmed: boolean;
      };
    };
    meta: {
      scale: number;
    }[];
  };
  tileheight: number;
  tilesets: {
    firstgid: number;
    image: string;
    imageheight: number;
    imagewidth: number;
    margin: number;
    name: string;
    properties: {};
    spacing: number;
    terrains: { name: string; tile: number }[];
    tileheight: number;
    tileoffset: { x: number; y: number };
    tiles: { terrain: number[] }[];
    tilewidth: number;
  }[];
  tilewidth: number;
  version: number;
  width: number;
}
