import { Application, Container, Graphics } from 'pixi.js';

import { calcElevation } from './utils/calcElevation';
import { calcVertices } from './utils/calcVertices';
import { drawColor } from './utils/drawColor';
import { drawTexture } from './utils/drawTexture';
import { noise } from './utils/noise';

const TILES = 32;
const TILE_SIZE = 64;
let debug = false;
let showTexture = true;

export function isometricMap(app: Application): Container {

  const container = new Container();
  container.position.set(app.screen.width / 2, 100);
	container.scale.x = TILES * TILE_SIZE / (TILES+TILE_SIZE * 25);
	container.scale.y = container.scale.x * 0.5;


  let isoPlane: any;
	let column: any[] = [];

  app.loader
    .add('gras', 'https://i.ibb.co/X73v3z0/gras.png')
    .add('rock', 'https://i.ibb.co/1QSLMCx/rock.jpg')
    .add('water', 'https://i.ibb.co/g3XKDmM/water.jpg')
    .load(generateTerain);


  function generateTerain() {
  
    isoPlane = new Graphics();
    isoPlane.rotation = Math.PI / 4;
    container.addChild(isoPlane);
    
    for(let x = 0; x < TILES; x++) {
      
      let tiles = [];
      for(let y = 0; y < TILES; y++) {
        
        //CREATE noise
        const rawNoise = noise(x/5, y/5);
        
        //CALC vertices
        const vertices = calcVertices(column, tiles, rawNoise, x, y);
        
        //CALC elevation direction
        let vertDiff = [];
        vertDiff[0] = x * TILE_SIZE - vertices[0].x;
        vertDiff[1] = x * TILE_SIZE - vertices[1].x;
        vertDiff[2] = x * TILE_SIZE - vertices[2].x;
        vertDiff[3] = x * TILE_SIZE - vertices[3].x;
        const elevation = calcElevation(vertDiff, TILE_SIZE * 2);
        
        //CALC steepness
        //const steepness = calcSteepness(vertices);
        
        //DRAW color or texture
        if(showTexture) {
          drawTexture(app, isoPlane, vertices, rawNoise, elevation[0], elevation[1]);
        } else {
          drawColor(isoPlane, vertices, rawNoise, elevation[0], elevation[1], debug);
        }
        
        //ADD to array
        tiles.push(vertices);
      }
      
      column.push(tiles);
      
    }
  }

  return container;
}

