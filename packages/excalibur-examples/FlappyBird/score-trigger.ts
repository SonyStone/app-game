import { Actor, vec, Vector } from 'excalibur';
import { Config } from './config';
import { Level } from './level';
import { Resources } from './resources';

export class ScoreTrigger extends Actor {
  constructor(
    pos: Vector,
    private level: Level
  ) {
    super({
      pos,
      width: 32,
      height: Config.PipeGap,
      anchor: vec(0, 0),
      // color: ex.Color.Violet,
      vel: vec(-Config.PipeSpeed, 0)
    });

    this.on('exitviewport', () => {
      this.kill();
    });
  }

  override onCollisionStart(): void {
    this.level.incrementScore();
    Resources.ScoreSound.play();
  }
}
