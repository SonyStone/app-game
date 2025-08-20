import { Color, Engine, Font, Label, Random, Scene, TextAlign, vec } from 'excalibur';
import { Bird } from './bird';
import { Config } from './config';
import { Ground } from './ground';
import { PipeFactory } from './pipe-factory';
import { Resources } from './resources';

export class Level extends Scene {
  score: number = 0;
  best: number = 0;
  random = new Random();
  pipeFactory = new PipeFactory(this, this.random, Config.PipeInterval);
  bird = new Bird(this);
  ground!: Ground;

  startGameLabel = new Label({
    text: 'Tap to Start',
    x: 200,
    y: 200,
    z: 2,
    font: new Font({
      size: 30,
      color: Color.White,
      textAlign: TextAlign.Center
    })
  });

  scoreLabel = new Label({
    text: 'Score: 0',
    x: 0,
    y: 0,
    z: 2,
    font: new Font({
      size: 20,
      color: Color.White
    })
  });

  bestLabel = new Label({
    text: 'Best: 0',
    x: 400,
    y: 0,
    z: 2,
    font: new Font({
      size: 20,
      color: Color.White,
      textAlign: TextAlign.End
    })
  });

  override onActivate(): void {
    Resources.BackgroundMusic.loop = true;
    Resources.BackgroundMusic.play();
  }

  override onInitialize(engine: Engine): void {
    this.add(this.bird);

    this.add(this.startGameLabel);
    this.add(this.scoreLabel);
    this.add(this.bestLabel);

    this.ground = new Ground(vec(0, engine.screen.drawHeight - 64));
    this.add(this.ground);

    const bestScore = localStorage.getItem('bestScore');
    if (bestScore) {
      this.best = +bestScore;
      this.setBestScore(this.best);
    } else {
      this.setBestScore(0);
    }

    this.showStartInstructions();
  }

  incrementScore() {
    this.scoreLabel.text = `Score: ${++this.score}`;
    this.setBestScore(this.score);
  }

  setBestScore(score: number) {
    if (score > this.best) {
      localStorage.setItem('bestScore', this.score.toString());
      this.best = score;
    }
    this.bestLabel.text = `Best: ${this.best}`;
  }

  showStartInstructions() {
    this.startGameLabel.graphics.isVisible = true;
    this.engine.input.pointers.once('down', () => {
      this.reset();

      this.startGameLabel.graphics.isVisible = false;
      this.bird.start();
      this.pipeFactory.start();
      this.ground.start();
    });
  }

  reset() {
    this.bird.reset();
    this.pipeFactory.reset();
    this.score = 0;
    this.scoreLabel.text = `Score: ${this.score}`;
  }

  triggerGameOver() {
    this.pipeFactory.stop();
    this.bird.stop();
    this.ground.stop();
    this.showStartInstructions();
    Resources.FailSound.play();
  }
}
