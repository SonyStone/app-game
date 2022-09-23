import Phaser, { Game, Physics, Types } from "phaser"
import { onCleanup } from "solid-js";

import Sky from './assets/sky.png?url';
import Platform from './assets/platform.png?url';
import Star from './assets/star.png?url';
import Bomb from './assets/bomb.png?url';
import Dude from './assets/dude.png?url';

export default function () {

  const canvas = <canvas> </canvas> as HTMLCanvasElement;

  const config: Types.Core.GameConfig  = {
    type: Phaser.WEBGL,
    canvas,
    width: 800,
    height: 600,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 1000 },
        debug: false
      }
    },
    scene: {
      preload: preload,
      create: create,
      update: update
    }

  }


  const game = new Game(config);



  onCleanup(() => {
    game.destroy(true);
  })

  return (
    <>
    {canvas}
    </>
  )
}

function preload(this: Phaser.Scene) {
  this.load.image('sky', Sky);
  this.load.image('ground', Platform);
  this.load.image('star', Star);
  this.load.image('bomb', Bomb);
  this.load.spritesheet('dude', Dude, { frameWidth: 32, frameHeight: 48 }
  );
}

let score = 0;
let scoreText: Phaser.GameObjects.Text;
let platforms:  Physics.Arcade.StaticGroup;
let player: Types.Physics.Arcade.SpriteWithDynamicBody;
let stars: Physics.Arcade.Group;
let bombs: Physics.Arcade.Group;
let gameOver = false;
function create (this: Phaser.Scene) {
  {
    this.add.image(400, 300, 'sky');
    this.add.image(400, 300, 'star');
  
    platforms = this.physics.add.staticGroup();
  
    platforms.create(400, 568, 'ground').setScale(2).refreshBody();
  
    platforms.create(600, 400, 'ground');
    platforms.create(50, 250, 'ground');
    platforms.create(750, 220, 'ground');
  }

  {
    player = this.physics.add.sprite(100, 450, 'dude');
  
    player.setBounce(0.1);
    player.setCollideWorldBounds(true);
  
    this.anims.create({
      key: 'left',
      frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1
    });
  
    this.anims.create({
      key: 'turn',
      frames: [ { key: 'dude', frame: 4 } ],
      frameRate: 20
    });
  
    this.anims.create({
      key: 'right',
      frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
      frameRate: 10,
      repeat: -1
    });
  }

  this.physics.add.collider(player, platforms);

  {
    stars = this.physics.add.group({
      key: 'star',
      repeat: 11,
      setXY: { x: 12, y: 0, stepX: 70 }
    });

    stars.children.iterate((child) => {

      (child as any).setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));

      return null;
    });

    this.physics.add.collider(stars, platforms);
  }

  this.physics.add.overlap(player, stars, collectStar, undefined, this);

  scoreText = this.add.text(16, 16, 'score: 0', { fontSize: '32px', color: '#000' });

  {
    bombs = this.physics.add.group();
    
    this.physics.add.collider(bombs, platforms);
    
    this.physics.add.collider(player, bombs, hitBomb, undefined, this);
  }
}

function hitBomb(this: Phaser.Scene, player: any, bomb: any)
{
    this.physics.pause();

    player.setTint(0xff0000);

    player.anims.play('turn');

    gameOver = true;
}

function collectStar(player: any, star: any)
{
    star.disableBody(true, true);
    score += 10;
    scoreText.setText('Score: ' + score);

    if (stars.countActive(true) === 0) {
      stars.children.iterate((child) => {

        (child as any).enableBody(true, (child as any).x, 0, true, true);
        return null;
      });

      var x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);

      var bomb = bombs.create(x, 16, 'bomb');
      bomb.setBounce(1);
      bomb.setCollideWorldBounds(true);
      bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
    }
}

let cursors: Types.Input.Keyboard.CursorKeys | undefined;
function update (this: Phaser.Scene) {

  cursors = this.input.keyboard?.createCursorKeys();

  const SPEED = 260

  if (cursors?.left.isDown) {
    player.setVelocityX(-SPEED);

    player.anims.play('left', true);
  } else if (cursors?.right.isDown) {
    player.setVelocityX(SPEED);

    player.anims.play('right', true);
  } else {
    player.setVelocityX(0);

    player.anims.play('turn');
  } 

  if (cursors?.up.isDown && player.body.touching.down) {
    player.setVelocityY(-630);
  }
}