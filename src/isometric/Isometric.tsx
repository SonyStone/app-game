import {
  Application,
  Container,
  Graphics,
  Sprite,
  Spritesheet,
  utils,
  Assets,
  Texture,
} from "pixi.js";
import { fromEvent } from "rxjs";
import { onCleanup } from "solid-js";

import { collisionExample } from "./collisionExample";
import { isoBasic } from "./isoBasic";
import { offseting } from "./pointer";
import { position } from "./position";
import { useStats } from "../Stats.provider";

import rottentower from "./assets/rottentower.png";
import isometricGrassAndWater from "./assets/isometric-grass-and-water";

import house_1 from "./assets/house_1.png";

export default function Main() {
  const app = new Application({
    // width: window.document.body.clientWidth,
    // height: window.document.body.clientHeight,
    // backgroundColor: 0x1099bb,
    // resolution: window.devicePixelRatio || 1,
    // resolution: 1,
  });

  console.log(`app`, app);

  const stats = useStats();

  window.onresize = () => {
    console.log(
      `W.H`,
      window.document.body.clientWidth,
      window.document.body.clientHeight
    );
    // app.renderer.resolution = window.devicePixelRatio || 1;
    // app.screen.height = window.document.body.clientHeight;
    // app.screen.width = window.document.body.clientWidth;
    console.log(`resolution`, app.renderer.resolution);
    stats.begin();
    app.renderer.resize(
      window.document.body.clientWidth,
      window.document.body.clientHeight
    );
    stats.end();
  };

  const world_container = new Container();
  app.stage.addChild(world_container);

  const sprite = Sprite.from(rottentower);
  sprite.position.set(0, 0);
  sprite.scale.set(0.5);

  function filterOn() {
    // sprite.filters = [outlineFilterBlack, outlineFilterWhite];
  }

  function filterOff() {
    // sprite.filters = [outlineFilterBlack];
  }

  sprite.interactive = true;
  sprite.on("pointerover", filterOn).on("pointerout", filterOff);
  filterOff();

  async function load() {
    Assets.add("map", isometricGrassAndWater.map);
    Assets.add("tiles", isometricGrassAndWater.tiles);

    const assets = await Assets.load<Texture>(["map", "tiles"]);
    const map = await loadMap(assets);

    // map.scale.y = 2;
    // map.rotation = -Math.PI / 4;

    // container.addChild(isometricMap(app));
    map.position.set(0, 0);

    map.addChild(sprite);

    world_container.addChild(map);

    world_container.addChild(isoBasic(app));
    world_container.addChild(collisionExample(app, world_container, stats));

    {
      const sprite = Sprite.from(house_1);
      sprite.position.set(350, 250);
      sprite.scale.set(0.3);
      map.addChild(sprite);
      sprite.interactive = true;
      sprite
        .on("pointerover", () => {
          // sprite.filters = [outlineFilterWhite];
        })
        .on("pointerout", () => {
          sprite.filters = [];
        });
    }
  }

  load();

  world_container.position.copyFrom(position);
  const sub1 = offseting(window.document.body).subscribe(([x, y]) => {
    stats.begin();
    position.set(position.x - x, position.y - y);
    world_container.position.copyFrom(position);
    stats.end();
  });

  const sub2 = fromEvent<WheelEvent>(window, "wheel").subscribe((event) => {
    if (event.deltaY < 0) {
      world_container.scale.set(
        world_container.scale.x * 1.25,
        world_container.scale.y * 1.25
      );
    } else {
      world_container.scale.set(
        world_container.scale.x / 1.25,
        world_container.scale.y / 1.25
      );
    }
  });

  onCleanup(() => {
    app.stop();
    app.destroy();
    utils.destroyTextureCache();
    sub1.unsubscribe();
    sub2.unsubscribe();
    window.onresize = null;
  });

  return <>{app.view}</>;
}

async function loadMap({ map, tiles }: Record<string, Texture>) {
  const data = map;

  console.log(`map`, map);

  // const tilewidth = data.width;
  // const tileheight = data.height;

  // const tileWidthHalf = tilewidth / 2;
  // const tileHeightHalf = tileheight / 2;

  // const layer = data.layers[0].data;

  // const mapwidth = data.layers[0].width;
  // const mapheight = data.layers[0].height;

  // const centerX = mapwidth * tileWidthHalf;
  // const centerY = 16;

  // let i = 0;

  // const sheet = new Spritesheet(tiles.texture!, data.spritesheet);
  // const parse = await new Promise((resolve) => sheet.parse(resolve));

  const container = new Container();
  const g = new Graphics();
  g.lineStyle(1, 0xbbffff, 0.4);

  // for (let y = 0; y < mapheight; y++) {
  //   for (let x = 0; x < mapwidth; x++) {
  //     const id = layer[i] - 1;

  //     const tx = (x - y) * tileWidthHalf;
  //     const ty = (x + y) * tileHeightHalf;

  //     const tile = new Sprite(sheet.textures[id]);
  //     tile.x = tx;
  //     tile.y = ty;

  //     // console.log(`xy`, tx, ty);

  //     // const bounds = tile.getLocalBounds();
  //     // g.drawRect(bounds.x + tx, bounds.y + ty, bounds.width, bounds.height);
  //     // g.drawRect(bounds.x + tx, bounds.y + ty + 16, bounds.width, bounds.height - 32);

  //     container.addChild(tile);

  //     i++;
  //   }
  // }

  container.addChild(g);

  return container;
}
