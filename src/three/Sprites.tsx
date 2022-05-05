import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  Color,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  sRGBEncoding,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from 'three';

import isometricGrassAndWater, {
  TilesMap,
} from '../isometric/assets/isometric-grass-and-water';
import { useStats } from '../Stats.provider';
import createProjectedMaterial, { project } from './box/projectedMaterial';
import { useCamera } from './Camera.provider';
import s from './SvgLoader.module.scss';

export default function Sprites() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const { camera, controls, resize } = useCamera();

  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = sRGBEncoding;
  renderer.sortObjects = false;

  controls.init(renderer.domElement);

  const stats = useStats();

  createEffect(() => {
    const { width, height } = resize();
    renderer.setSize(width, height);
    render();
  });

  const scene = new Scene();

  const group = new Group();

  // 26.565
  // with dimetric projection and a 2:1 pixel ratio

  function loadTexture(path: string): Promise<Texture> {
    return new TextureLoader().loadAsync(path).then((texture) => {
      texture.magFilter = NearestFilter;
      return texture;
    });
  }

  function loadJson<T = any>(path: string): Promise<T> {
    return fetch(path).then((response) => response.json());
  }

  createEffect(async () => {
    const texture = await loadTexture(isometricGrassAndWater.tiles);
    const data = await loadJson<TilesMap>(isometricGrassAndWater.map);

    const { imageheight, imagewidth } = data.tilesets[0];

    const isoProjectCamera = new OrthographicCamera(
      0,
      imagewidth,
      0,
      -imageheight,
      0,
      imageheight * 2
    );
    // isoProjectCamera.rotateY(Math.PI / 4);
    isoProjectCamera.rotateX((-30 * Math.PI) / 180);

    // 256 x 384
    isoProjectCamera.position.set(0, 0, 0);
    isoProjectCamera.updateMatrixWorld();

    // group.add(new CameraHelper(isoProjectCamera));
    const material = createProjectedMaterial({
      camera: isoProjectCamera,
      texture,
    });

    const geometry = new PlaneGeometry(256, 384 * 2);
    geometry.rotateX(-Math.PI / 2);
    const plane = new Mesh(geometry, material);

    project(plane);

    // group.add(plane);

    function createSprite(x: number, y: number): Mesh {
      const material = createProjectedMaterial({
        camera: isoProjectCamera,
        texture,
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
        y: frame.frame.y * 2 + tileheight * 2,
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

  scene.add(group);

  scene.background = new Color(0x1099bb);

  // grid hight = 25 sprites
  // sprite hight = 64px

  const tileHight = Math.sqrt(32 * 32 + 32 * 32);

  const helper = new GridHelper(tileHight * 25, 25);
  const helperGrid = (tileHight * 25) / 1.472;
  helper.position.set(0, 0.1, helperGrid);
  helper.rotateY(Math.PI / 4);
  group.add(helper);

  // scene.add(new GridHelper(tileHight * 25, 25));
  group.position.set(tileHight * 12, 0, -(tileHight * 12));
  group.rotateY(-Math.PI / 4);

  {
    const geometry = new BoxGeometry(32, 64, 32);
    const material = new MeshBasicMaterial({ color: 0x55ff55 });
    const cube = new Mesh(geometry, material);
    cube.position.set(500, 10, 400);
    scene.add(cube);
  }

  function render() {
    stats.begin();

    renderer.render(scene, camera);
    stats.end();
  }
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  render();

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    controls.removeEventListener('change', render);
  });

  return <>{canvas}</>;
}
