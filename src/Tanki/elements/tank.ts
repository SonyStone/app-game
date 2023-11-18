import * as m3 from "@webgl/math/mut-m3";
import * as v2 from "@webgl/math/mut-v2";
import { Container, Graphics, IPointData, Point, Transform } from "pixi.js";
import { Key } from "ts-keycode-enum";
import "@pixi/math-extras";

// import * as Color from 'color-js';

export function angleTo(vec1: IPointData, vec2: IPointData) {
  return Math.atan2(vec1.y - vec2.y, vec1.x - vec2.x);
}

const anglePoint = new Point();
export function fromAngle(angle: number): Point {
  return anglePoint.set(Math.cos(angle), Math.sin(angle));
}

const tankBody = () =>
  new Graphics()
    .lineStyle(2, 0x191919, 1)
    .beginFill(0xbf3030)
    .drawRect(-20, -15, 40, 30)
    .endFill()

    .moveTo(-20, 15)
    .lineTo(20, 0.5)
    .lineTo(20, -0.5)
    .lineTo(-20, -15);

const tankGun = () =>
  new Graphics()
    .beginFill(0xbf3030)
    .lineStyle(2, 0x191919, 1)
    .drawRect(0, -10 / 2, 30, 10)
    .closePath()

    .drawCircle(0, 0, 10)
    .closePath()
    .endFill();

export const createPull = () => {
  const pull = new Transform();
  pull.position.set(0, 0);
  const distance = 18;
  const direction = new Point(0, 0);

  return {
    updatePull(objectToMove: Transform, keyboard: Set<Key>, camera: Transform) {
      direction.set(0, 0);

      if (keyboard.has(Key.UpArrow) || keyboard.has(Key.W)) {
        const up = -Math.PI / 2 - camera.rotation;
        direction.add(fromAngle(up), direction);
      }
      if (keyboard.has(Key.DownArrow) || keyboard.has(Key.S)) {
        const down = Math.PI / 2 - camera.rotation;
        direction.add(fromAngle(down), direction);
      }
      if (keyboard.has(Key.LeftArrow) || keyboard.has(Key.A)) {
        const left = Math.PI - camera.rotation;
        direction.add(fromAngle(left), direction);
      }
      if (keyboard.has(Key.RightArrow) || keyboard.has(Key.D)) {
        const right = 0 - camera.rotation;
        direction.add(fromAngle(right), direction);
      }

      let speed = 0;
      if (direction.x !== 0 || direction.y !== 0) {
        direction.normalize(direction);
        // direction.multiplyScalar(50, direction);
        speed = 5;
      }

      pull.position.add(direction.multiplyScalar(speed), pull.position);

      // console.log(`pull`, pull.position.x, direction.x);

      // console.log(`pull`, pull.position.x);
      const rotation = angleTo(pull.position, objectToMove.position);
      objectToMove.position.set(
        pull.position.x - Math.cos(rotation) * distance,
        pull.position.y - Math.sin(rotation) * distance
      );
      objectToMove.rotation = rotation;
    },
  };
};

export function createTank() {
  const container = new Container();
  container.addChild(tankBody());
  container.addChild(tankGun());

  return container;
}

function setPixiMatrix(t: Transform, m2: m3.Mat3) {
  t.localTransform.set(m2[0], m2[1], m2[3], m2[4], m2[6], m2[7]);
  t.setFromMatrix(t.localTransform);
}
