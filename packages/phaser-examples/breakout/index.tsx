import 'phaser';
import { Game, Scene, WEBGL } from 'phaser';
import { onCleanup } from 'solid-js';
import breakout_json from './breakout.json?url';
import breakout_png from './breakout.png?url';

function startupSystem(load: Phaser.Loader.LoaderPlugin) {
  load.atlas('assets', breakout_png, breakout_json);
}

function createPhysicsSystem(physics: Phaser.Physics.Arcade.ArcadePhysics, resources: any) {
  //  Enable world bounds, but disable the floor
  physics.world.setBoundsCollision(true, true, true, false);

  const bricks = physics.add.staticGroup({
    key: 'assets',
    frame: ['blue1', 'red1', 'green1', 'yellow1', 'silver1', 'purple1'],
    frameQuantity: 10,
    gridAlign: {
      width: 10,
      height: 6,
      cellWidth: 64,
      cellHeight: 32,
      x: 112,
      y: 100
    }
  });

  const ball = physics.add.image(400, 500, 'assets', 'ball1').setCollideWorldBounds(true).setBounce(1);

  ball.setData('onPaddle', true);

  const paddle = physics.add.image(400, 550, 'assets', 'paddle1').setImmovable();

  resources.ball = ball;
  resources.bricks = bricks;
  resources.paddle = paddle;

  //  Our colliders
  physics.add.collider(ball, bricks, (obj1, obj2) => hitBrick(obj1 as any, obj2 as any));
  physics.add.collider(ball, paddle, (obj1, obj2) => hitPaddle(obj1 as any, obj2 as any));
}

function hitBrick(
  ball: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
  brick: Phaser.Types.Physics.Arcade.ImageWithStaticBody
) {
  brick.disableBody(true, true);
}

function hitPaddle(
  ball: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
  paddle: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
) {
  let diff = 0;

  if (ball.x < paddle.x) {
    //  Ball is on the left-hand side of the paddle
    diff = paddle.x - ball.x;
    ball.setVelocityX(-10 * diff);
  } else if (ball.x > paddle.x) {
    //  Ball is on the right-hand side of the paddle
    diff = ball.x - paddle.x;
    ball.setVelocityX(10 * diff);
  } else {
    //  Ball is perfectly in the middle
    //  Add a little random X to stop it bouncing straight up!
    ball.setVelocityX(2 + Math.random() * 8);
  }
}

function creaetInputSystem(
  input: Phaser.Input.InputPlugin,
  ball: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
  paddle: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
) {
  //  Input events
  input.on('pointermove', (pointer: PointerEvent) => {
    //  Keep the paddle within the game
    paddle.x = Phaser.Math.Clamp(pointer.x, 52, 748);

    if (ball.getData('onPaddle')) {
      ball.x = paddle.x;
    }
  });

  input.on('pointerup', (pointer: PointerEvent) => {
    if (ball.getData('onPaddle')) {
      ball.setVelocity(-75, -300);
      ball.setData('onPaddle', false);
    }
  });
}

function resetLevelSystem(
  bricks: Phaser.Physics.Arcade.StaticGroup,
  ball: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
  paddle: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
) {
  if (bricks.countActive() === 0) {
    ball.setVelocity(0);
    ball.setPosition(paddle.x, 500);
    ball.setData('onPaddle', true);

    (bricks.children as any).each((brick: Phaser.Types.Physics.Arcade.ImageWithStaticBody) => {
      brick.enableBody(false, 0, 0, true, true);
    });
  }
}

function resetBallSystem(
  ball: Phaser.Types.Physics.Arcade.ImageWithDynamicBody,
  paddle: Phaser.Types.Physics.Arcade.ImageWithDynamicBody
) {
  if (ball.y > 600) {
    ball.setVelocity(0);
    ball.setPosition(paddle.x, 500);
    ball.setData('onPaddle', true);
  }
}

class Breakout extends Scene {
  resources: any = {};

  preload() {
    startupSystem(this.load);
  }

  create() {
    createPhysicsSystem(this.physics, this.resources);
    creaetInputSystem(this.input, this.resources.ball, this.resources.paddle);
  }

  update(): void {
    resetLevelSystem(this.resources.bricks, this.resources.ball, this.resources.paddle);
    resetBallSystem(this.resources.ball, this.resources.paddle);
  }
}

const config = {
  type: WEBGL,
  width: 800,
  height: 600,
  parent: 'phaser-example',
  scene: [Breakout],
  physics: {
    default: 'arcade'
  }
};

export default function App() {
  const game = new Game(config);

  onCleanup(() => {
    game.destroy(true);
  });

  return <></>;
}
