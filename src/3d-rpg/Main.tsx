import {
  AmbientLight,
  AnimationClip,
  AnimationMixer,
  BoxBufferGeometry,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneBufferGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import s from "./Main.module.scss";

import girlWalk from "./assets/girl-walk.fbx?url";
import gatherObjects from "./assets/gather-objects.fbx?url";
import lookAround from "./assets/look-around.fbx?url";
import run from "./assets/run.fbx?url";
import pushButton from "./assets/push-button.fbx?url";
import stumbleBackwards from "./assets/stumble-backwards.fbx?url";
import { For, onCleanup } from "solid-js";
import JoyStick from "./JoyStick";

enum Modes {
  NONE,
  PRELOAD,
  INITIALISING,
  CREATING_LEVEL,
  ACTIVE,
  GAMEOVER,
}

export default function Main() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const renderer = new WebGLRenderer({
    canvas,
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  const clock = new Clock();
  const camera = new PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const scene = new Scene();

  scene.background = new Color(0xa0a0a0);
  scene.fog = new Fog(0xa0a0a0, 200, 1000);
  {
    const light = new HemisphereLight(0xffffff, 0x444444);
    light.position.set(0, 200, 0);
    scene.add(light);
  }
  {
    const light = new DirectionalLight(0xffffff);
    light.position.set(0, 200, 100);
    light.castShadow = true;
    light.shadow.camera.top = 180;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.left = -120;
    light.shadow.camera.right = 120;
    scene.add(light);
  }

  // ground
  {
    var mesh = new Mesh(
      new PlaneBufferGeometry(2000, 2000),
      new MeshPhongMaterial({ color: 0x999999, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new GridHelper(2000, 40, 0x000000, 0x000000);
    (grid.material as Material).opacity = 0.2;
    (grid.material as Material).transparent = true;
    scene.add(grid);
  }

  const loader = new FBXLoader();

  const cams = ["front", "back", "wide", "overhead", "collect"];

  const player: {
    mixer: AnimationMixer;
    object: Group;
    root: Group;
    cameras: {
      front: Object3D;
      back: Object3D;
      wide: Object3D;
      overhead: Object3D;
      collect: Object3D;
      active: Object3D;
    };
    walk: AnimationClip;
    [key: string]: any;
  } = {} as any;
  let cameraFade = 0;

  function playerControl(forward: number, turn: number) {
    //console.log(`playerControl(${forward}), ${turn}`);

    if (forward > 0) {
      if (player.action != girlWalk) action(girlWalk);
    } else {
      if (player.action == girlWalk) action(lookAround);
    }
    if (forward == 0 && turn == 0) {
      delete player.move;
    } else {
      player.move = { forward, turn };
    }
  }

  function createCameras(parent: Group) {
    const front = new Object3D();
    front.position.set(112, 100, 200);
    front.parent = parent;
    const back = new Object3D();
    back.position.set(0, 100, -250);
    back.parent = parent;
    const wide = new Object3D();
    wide.position.set(178, 139, 465);
    wide.parent = parent;
    const overhead = new Object3D();
    overhead.position.set(0, 400, 0);
    overhead.parent = parent;
    const collect = new Object3D();
    collect.position.set(40, 82, 94);
    collect.parent = parent;
    player.cameras = { front, back, wide, overhead, collect } as any;
    player.cameras.active = player.cameras.wide;
    cameraFade = 0.1;
    setTimeout(function () {
      player.cameras.active = player.cameras.back;
    }, 2000);
  }

  let environmentProxy = undefined;
  function createDummyEnvironment() {
    const env = new Group();
    env.name = "Environment";
    scene.add(env);

    const geometry = new BoxBufferGeometry(150, 150, 150);
    const material = new MeshBasicMaterial({ color: 0xffff00 });

    for (let x = -1000; x < 1000; x += 300) {
      for (let z = -1000; z < 1000; z += 300) {
        const block = new Mesh(geometry, material);
        block.position.set(x, 75, z);
        env.add(block);
      }
    }

    environmentProxy = env;
  }

  const anims = [
    gatherObjects,
    lookAround,
    pushButton,
    run,
    stumbleBackwards,
    girlWalk,
  ];

  function loadNextAnim(loader: FBXLoader) {
    // let anim = anims.pop()!;

    Promise.all(
      anims.map((anim) =>
        loader.loadAsync(anim).then((object) => {
          player[anim] = object.animations[0];
        })
      )
    ).then(() => {
      action(lookAround);
    });
  }

  let id: number;
  function animate() {
    const dt = clock.getDelta();

    id = requestAnimationFrame(function () {
      animate();
    });

    if (player.mixer != undefined) {
      player.mixer.update(dt);
    }

    if (player.move != undefined) {
      if (player.move.forward > 0) player.object.translateZ(dt * 100);
      player.object.rotateY(player.move.turn * dt);
    }

    if (player.cameras != undefined && player.cameras.active != undefined) {
      camera.position.lerp(
        player.cameras.active.getWorldPosition(new Vector3()),
        cameraFade
      );
      const pos = player.object.position.clone();
      pos.y += 90;
      camera.lookAt(pos);
    }

    renderer.render(scene, camera);

    // if (stats!=undefined) stats.update();
  }

  function action(name: string) {
    const anim = player[name];
    const action = player.mixer.clipAction(anim, player.root);
    player.mixer.stopAllAction();
    player.action = name;
    action.fadeIn(0.5);
    action.play();
  }

  loader.loadAsync(girlWalk).then((object) => {
    const mixer = new AnimationMixer(object);
    player.mixer = mixer;
    player.root = mixer.getRoot() as Group;

    object.name = "Character";

    object.traverse(function (child) {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(object);
    player.object = object;
    player.walk = object.animations[0];

    // joystick = new JoyStick({
    //     onMove: game.playerControl,
    //     game: game
    // });

    createCameras(object);
    loadNextAnim(loader);
    createDummyEnvironment();

    console.log(`done 2`, player);
  });

  animate();

  onCleanup(() => {
    renderer.dispose();
    scene.clear();
    cancelAnimationFrame(id);
  });

  return (
    <>
      {canvas}
      <div class={s.controls}>
        <select
          value={cams[1]}
          onChange={(ev) => {
            const value = (ev.target as any).value;
            player.cameras.active = (player.cameras as any)[value];
          }}
        >
          <For each={cams}>
            {(item) => <option value={item}>{item}</option>}
          </For>
        </select>

        <select
          value={anims[1]}
          onChange={(ev) => {
            const value = (ev.target as any).value;
            action(value);
          }}
        >
          <For each={anims}>
            {(item) => <option value={item}>{item}</option>}
          </For>
        </select>
      </div>
      <JoyStick maxRadius={30} onMove={playerControl} />
    </>
  );
}
