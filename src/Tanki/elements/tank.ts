import { Container, Graphics } from 'pixi.js';

import { Vector2d } from '../math/vector2d';
import { Locator } from './locator';

// import * as Color from 'color-js';

export class Tank extends Container {
  public pull: Vector2d;
  // public position: Vector2d = new Vector2d();
  // public color = Utils.HSBtoRGB(360, 75, 75);
  public color = 0xbf3030;
  // public color: number = Color({hue: 0, saturation: 75, lightness: 75}).getValue();
  public direction: Vector2d = new Vector2d();

  // public rotation: number = 0;
  public speed = 5;

  public positionRotation = 0;
  public target: Vector2d = new Vector2d();
  public targetRotation = 0;

  public body = this.getBody();
  public gun = this.getGun();
  public boundingBox = new Graphics();

  constructor() {
    super();
    this.interactive = true;
    this.pull = new Vector2d();
    const locator = new Locator().setTransform(0, 0, 10, 10);

    this.addChild(this.body);
    this.addChild(this.gun);
    this.addChild(this.boundingBox);
    this.gun.addChild(locator);
  }

  public player(keyboard, mouse, camera) {
    this.targetRotation =
      Vector2d.angleTo(
        this.target.set(mouse),
        camera.targeting(this.position)
        // this.position.mult(camera.zoom).rotate(camera.rotation).add(camera.position)
      ) - camera.rotation;

    let speed = 0;
    if (keyboard.up.pressed || keyboard.w.pressed) {
      this.direction = this.direction.add(
        Vector2d.fromAngle(-Math.PI / 2 - camera.rotation)
      );
      speed = this.speed;
    }
    if (keyboard.down.pressed || keyboard.s.pressed) {
      this.direction = this.direction.add(
        Vector2d.fromAngle(Math.PI / 2 - camera.rotation)
      );
      speed = this.speed;
    }
    if (keyboard.left.pressed || keyboard.a.pressed) {
      this.direction = this.direction.add(
        Vector2d.fromAngle(Math.PI - camera.rotation)
      );
      speed = this.speed;
    }
    if (keyboard.right.pressed || keyboard.d.pressed) {
      this.direction = this.direction.add(
        Vector2d.fromAngle(0 - camera.rotation)
      );
      speed = this.speed;
    }
    this.direction = this.direction.normalize();
    this.pull = this.pull.add(this.direction.mult(speed));
    // this.direction.setZero();
  }

  public update() {
    this.positionRotation = Vector2d.angleTo(this.pull, this.position);
    this.position.x = this.pull.x - Math.cos(this.positionRotation) * 18;
    this.position.y = this.pull.y - Math.sin(this.positionRotation) * 18;
    this.body.rotation = this.positionRotation;
    this.gun.rotation = this.targetRotation;

    this.updateBoundingBox(this.boundingBox);
  }

  public toString() {
    return (
      `position: ${this.position.x.toFixed(2)}, ${this.position.y.toFixed(
        2
      )}\n` +
      `pull: ${this.pull.toString()}\n` +
      `direction: ${this.direction.toString()}\n` +
      `targetRotation: ${this.targetRotation.toFixed(2)}\n` +
      `positionRotation: ${this.positionRotation.toFixed(2)}\n` +
      `rotation: ${this.rotation.toFixed(2)}\n`
    );
  }

  private getBody(): Graphics {
    return new Graphics()
      .lineStyle(2, 0x191919, 1)
      .beginFill(0xbf3030)
      .drawRect(-20, -15, 40, 30)
      .endFill()

      .moveTo(-20, 15)
      .lineTo(20, 0.5)
      .lineTo(20, -0.5)
      .lineTo(-20, -15);
  }

  private getGun(): Graphics {
    return new Graphics()
      .beginFill(0xbf3030)
      .lineStyle(2, 0x191919, 1)
      .drawRect(0, -10 / 2, 30, 10)
      .closePath()

      .drawCircle(0, 0, 10)
      .closePath()
      .endFill();
  }

  private updateBoundingBox(g: Graphics): void {
    g.clear();
    const bounds = this.getLocalBounds();
    g.lineStyle(0.5, 0xff0000, 1)
      .moveTo(bounds.left, bounds.bottom)
      .lineTo(bounds.left, bounds.top)
      .lineTo(bounds.right, bounds.top)
      .lineTo(bounds.right, bounds.bottom)
      .closePath();
  }
}
