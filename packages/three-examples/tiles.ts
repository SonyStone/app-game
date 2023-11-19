import { createEffect } from 'solid-js';
import {
  BoxGeometry,
  Group,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Texture,
  TextureLoader
} from 'three';

import createProjectedMaterial, { project } from './box/projectedMaterial';
import isometricGrassAndWater, { TilesMap } from './isometric/assets/isometric-grass-and-water';

import house from './isometric/assets/house_1.png';

export function loadTexture(path: string): Promise<Texture> {
  return new TextureLoader().loadAsync(path).then((texture) => {
    texture.magFilter = NearestFilter;
    return texture;
  });
}

export function loadJson<T = any>(path: string): Promise<T> {
  return fetch(path).then((response) => response.json());
}

interface IsoProjectCameraOptions {
  width: number;
  height: number;
}

export function createIsoProjectCamera({ width, height }: IsoProjectCameraOptions) {
  const isoProjectCamera = new OrthographicCamera(0, width, 0, -height, 0, height * 2);
  // isoProjectCamera.rotateY(Math.PI / 4);
  isoProjectCamera.rotateX((-30 * Math.PI) / 180);

  // 256 x 384
  isoProjectCamera.position.set(0, 0, 0);
  isoProjectCamera.updateMatrixWorld();

  return isoProjectCamera;
}

export function createTilesPlane(render: () => void): Group {
  const group = new Group();

  createEffect(async () => {
    const texture = await loadTexture(isometricGrassAndWater.tiles);
    const data = await loadJson<TilesMap>(isometricGrassAndWater.map);

    const { imageheight, imagewidth } = data.tilesets[0];

    const camera = createIsoProjectCamera({
      width: imagewidth,
      height: imageheight
    });

    const material = createProjectedMaterial({
      camera,
      texture
    });

    const geometry = new PlaneGeometry(imagewidth, imageheight * 2);
    geometry.translate(imagewidth / 2, -imageheight, 0);
    geometry.rotateX(-Math.PI / 2);
    const plane = new Mesh(geometry, material);

    project(plane);

    group.add(plane);

    render();
  });

  return group;
}

export function createHouse(render: () => void): Group {
  const group = new Group();

  createEffect(async () => {
    const texture = await loadTexture(house);

    const width = 930;
    const height = 857;

    const camera = createIsoProjectCamera({
      width,
      height
    });

    {
      const material = createProjectedMaterial({
        camera,
        texture
      });

      const geometry = new PlaneGeometry(width, height * 2);
      geometry.translate(width / 2, -height, 0);
      geometry.rotateX(-Math.PI / 2);
      const plane = new Mesh(geometry, material);

      project(plane);
      group.add(plane);
    }

    {
      const material = createProjectedMaterial({
        camera,
        texture,
        transparent: true
      });

      const height = 270;

      const geometry = new BoxGeometry(370, height, 470);
      geometry.rotateY(-Math.PI / 4);
      geometry.translate(445, height / 2, 1200);
      const plane = new Mesh(geometry, material);

      project(plane);
      group.add(plane);
    }

    {
      const material = createProjectedMaterial({
        camera,
        texture,
        transparent: true
      });

      // const material = new MeshBasicMaterial({
      //   wireframe: true,
      // });

      const height = 290;

      const geometry = new BoxGeometry(height, height, 650);
      geometry.rotateZ(-Math.PI / 4);
      geometry.rotateY(-Math.PI / 4);
      geometry.translate(445, height / 2 + 140, 1200);
      const plane = new Mesh(geometry, material);

      project(plane);
      group.add(plane);
    }

    render();
  });
  return group;
}

export function createTiles(render: () => void): Group {
  const group = new Group();

  createEffect(async () => {
    const texture = await loadTexture(isometricGrassAndWater.tiles);
    const data = await loadJson<TilesMap>(isometricGrassAndWater.map);

    const { imageheight, imagewidth } = data.tilesets[0];

    const camera = createIsoProjectCamera({
      width: imagewidth,
      height: imageheight
    });

    function createSprite(x: number, y: number): Mesh {
      const material = createProjectedMaterial({
        camera,
        texture
      });
      const geometry = new PlaneGeometry(64, 64 * 2);
      geometry.rotateX(-Math.PI / 2);
      // const material = new MeshBasicMaterial({ color: 0x00ff00 });
      const cube = new Mesh(geometry, material);
      cube.position.set(x, 0, y);
      project(cube);

      return cube;
    }

    const tilewidth = data.tilewidth;
    const tileheight = data.tileheight;
    const tileWidthHalf = tilewidth / 2;
    const tileHeightHalf = tileheight / 2;
    const layer = data.layers[0].data;

    const mapwidth = data.layers[0].width;
    const mapheight = data.layers[0].height;

    const sprites = Object.entries(data.spritesheet.frames)
      // .slice(0, 20)
      .map(([key, frame]) => ({
        x: frame.frame.x + tileWidthHalf,
        y: frame.frame.y * 2 + tileheight * 2
      }));

    let i = 0;
    for (let y = 0; y < mapheight; y++) {
      for (let x = 0; x < mapwidth; x++) {
        const id = layer[i] - 1;

        const sprite = sprites[id];
        if (sprite) {
          const tx = (x - y) * tileWidthHalf;
          const ty = (x + y) * tileHeightHalf * 2;

          const tile = createSprite(sprite.x, sprite.y);

          tile.position.set(tx, 0, ty);
          tile.rotateX(Math.PI / 8);

          group.add(tile);
        }

        i++;
      }
    }

    render();
  });

  return group;
}
