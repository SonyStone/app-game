import { Point } from 'pixi.js';

const TILES = 32;
const TILE_SIZE = 64;
const ELEVATION = 0;


export function calcVertices(
  column: any[],
  tiles: any,
  rawNoise: any,
  x: number,
  y: number
) {
  
  let n = (x === TILES - 1 || y === TILES - 1) ? 0 : rawNoise * 100;
  if(rawNoise >= 0.2) n = n * 3;
  if(rawNoise <= 0.3) n = 0;
  n = n + ELEVATION;
  
  let prevColTile = tiles[y-1]
    ? tiles[y-1]
    : null;

  let prevRowTile = column[x-1]
    ? column[x-1][y]
    : null;

  let v0 = new Point();
  let v1 = new Point();
  let v2 = new Point();
  let v3 = new Point();
    
  if(prevColTile !== null) {
    v0.x = prevColTile[2].x;
    v0.y = prevColTile[2].y;
    v1.x = prevColTile[3].x;
    v1.y = prevColTile[3].y;
  } else {
    v0.x = x * TILE_SIZE;
    v0.y = y * TILE_SIZE;
    v1.x = x * TILE_SIZE + TILE_SIZE;
    v1.y = y * TILE_SIZE;
  }
    
  if(prevRowTile !== null) {
    v0.x = prevRowTile[1].x;
    v0.y = prevRowTile[1].y;
    v2.x = prevRowTile[3].x;
    v2.y = prevRowTile[3].y;
  } else {
    v0.x = x * TILE_SIZE;
    v0.y = y * TILE_SIZE;
    v2.x = x * TILE_SIZE;
    v2.y = y * TILE_SIZE + TILE_SIZE;
  }
    
  if(x === TILES - 1 || y === TILES - 1) {
    v3.x = x * TILE_SIZE + TILE_SIZE;
    v3.y = y * TILE_SIZE + TILE_SIZE;
  } else {
    v3.x = x * TILE_SIZE + TILE_SIZE - n;
    v3.y = y * TILE_SIZE + TILE_SIZE - n;
  }
  
  return [v0, v1, v2, v3];
}

