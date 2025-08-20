import { Actor, Engine, vec, Vector } from 'excalibur';
import { Config } from './config';
import { Resources } from './resources';

export class Ground extends Actor {
  groundSprite = Resources.GroundImage.toSprite();
  moving = false;
  constructor(pos: Vector) {
    super({
      pos,
      anchor: vec(0, 0),
      height: 64,
      width: 400,
      z: 1
    });
  }

  onInitialize(engine: Engine): void {
    this.groundSprite.sourceView.width = engine.screen.drawWidth;
    this.groundSprite.destSize.width = engine.screen.drawWidth;
    this.graphics.use(this.groundSprite);
  }

  onPostUpdate(_engine: Engine, elapsedMs: number): void {
    if (!this.moving) return;
    this.groundSprite.sourceView.x += Config.PipeSpeed * (elapsedMs / 1000);
    this.groundSprite.sourceView.x = this.groundSprite.sourceView.x % Resources.GroundImage.width;
  }

  start() {
    this.moving = true;
  }

  stop() {
    this.moving = false;
  }
}
