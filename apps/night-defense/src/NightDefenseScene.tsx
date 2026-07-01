import { Container, Graphics, Sprite, Text, useApplication } from '@app-game/solid-pixi';
import {
  Container as PixiContainer,
  type FederatedPointerEvent,
  Graphics as PixiGraphics,
  Rectangle,
  RenderTexture,
  Sprite as PixiSprite,
  Text as PixiText,
  TextStyle,
  type Ticker
} from 'pixi.js';
import { createEffect, onCleanup } from 'solid-js';

const WAVE_RAMP_SECONDS = 75;
const NIGHT_FALL_SECONDS = 12;
const DAWN_CLEAR_SECONDS = 2.4;
const BOSS_SPAWN_SECONDS = 38;
const DAWN_AFTER_BOSS_SECONDS = 4;
const TOWER_MAX_HP = 140;
const TOWER_FIRE_INTERVAL = 0.14;
const DAWN_FIRE_INTERVAL = 0.025;
const TOWER_RADIUS = 28;
const BRUSH_RADIUS = 76;
const SHOT_HIT_PADDING = 8;
const SHOT_KNOCKBACK = 22;
const BOSS_SHOT_KNOCKBACK = 4;
const TARGET_VISIBILITY_THRESHOLD = 0.3;
const VISIBILITY_COLS = 72;
const VISIBILITY_ROWS = 42;
const MAX_ENEMIES = 52;

type GamePhase = 'running' | 'dawn' | 'won' | 'lost';
type EnemyKind = 'straight' | 'zigzag' | 'arc' | 'charger' | 'boss';

type Enemy = {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly pathDistance: number;
  readonly swayPhase: number;
  readonly swaySign: -1 | 1;
  x: number;
  y: number;
  age: number;
  radius: number;
  speed: number;
  hp: number;
  maxHp: number;
  damage: number;
};

type Shot = {
  readonly id: number;
  readonly targetId: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  life: number;
  damage: number;
};

type Spark = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: number;
};

type PointerSample = {
  x: number;
  y: number;
};

type VisibilityGrid = {
  readonly values: Float32Array;
  width: number;
  height: number;
};

type GameState = {
  elapsed: number;
  towerHp: number;
  kills: number;
  spawnTimer: number;
  fireTimer: number;
  nextEnemyId: number;
  nextShotId: number;
  phase: GamePhase;
  aimTargetId: number | null;
  bossSpawned: boolean;
  bossDefeatedAt: number | null;
  dawnStartedAt: number | null;
  enemies: Enemy[];
  shots: Shot[];
  sparks: Spark[];
};

type SceneProps = {
  width: number;
  height: number;
};

export function NightDefenseScene(props: SceneProps) {
  const app = useApplication();
  let lightTexture = RenderTexture.create({ width: 1, height: 1, dynamic: true });
  let nextLightTexture = RenderTexture.create({ width: 1, height: 1, dynamic: true });
  const lightDecayFill = new PixiGraphics();
  const lightBrush = new PixiGraphics();
  const lightLine = new PixiGraphics();
  const lightCopySprite = new PixiSprite(lightTexture);
  const visibility: VisibilityGrid = {
    values: new Float32Array(VISIBILITY_COLS * VISIBILITY_ROWS),
    width: VISIBILITY_COLS,
    height: VISIBILITY_ROWS
  };
  const game = createInitialGameState();
  const activePointers = new Map<number, PointerSample>();

  let rootLayer!: PixiContainer;
  let fieldGraphics!: PixiGraphics;
  let enemyGraphics!: PixiGraphics;
  let shotGraphics!: PixiGraphics;
  let effectGraphics!: PixiGraphics;
  let towerGraphics!: PixiGraphics;
  let darknessGraphics!: PixiGraphics;
  let revealedLayer!: PixiContainer;
  let revealedFieldGraphics!: PixiGraphics;
  let revealedEnemyGraphics!: PixiGraphics;
  let revealedShotGraphics!: PixiGraphics;
  let revealedEffectGraphics!: PixiGraphics;
  let revealedTowerGraphics!: PixiGraphics;
  let lightSprite!: PixiSprite;
  let hudText!: PixiText;
  let statusText!: PixiText;
  let lastPoint: PointerSample | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  createEffect(() => {
    resizeScene(props.width, props.height);
  });

  const tickerCallback = (ticker: Ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const width = sceneWidth(props.width);
    const height = sceneHeight(props.height);

    updateVisualLightMap(width, height, dt, game);
    updateTargetVisibility(visibility, dt, game);

    if (game.phase === 'running' || game.phase === 'dawn') {
      updateGame(game, visibility, width, height, dt);
    }

    renderScene(game, visibility, width, height);
  };

  app.ticker.add(tickerCallback);

  onCleanup(() => {
    app.ticker.remove(tickerCallback);
    lightTexture.destroy(true);
    nextLightTexture.destroy(true);
    lightDecayFill.destroy();
    lightBrush.destroy();
    lightLine.destroy();
    lightCopySprite.destroy();
  });

  function resizeScene(width: number, height: number) {
    const nextWidth = sceneWidth(width);
    const nextHeight = sceneHeight(height);

    if (lastWidth === nextWidth && lastHeight === nextHeight) {
      return;
    }

    lastWidth = nextWidth;
    lastHeight = nextHeight;
    rootLayer.hitArea = new Rectangle(0, 0, nextWidth, nextHeight);
    lightTexture.resize(nextWidth, nextHeight);
    nextLightTexture.resize(nextWidth, nextHeight);
    lightSprite.width = nextWidth;
    lightSprite.height = nextHeight;
    resetVisibility(visibility);
    resetLightMap();
    renderScene(game, visibility, nextWidth, nextHeight);
  }

  function clearAtPoint(x: number, y: number, radius = BRUSH_RADIUS) {
    paintLightAt(x, y, radius);
    clearVisibilityAt(visibility, x, y, radius, lastWidth, lastHeight);
  }

  function clearBetweenPoints(from: PointerSample, to: PointerSample, radius = BRUSH_RADIUS) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / (radius * 0.45)));

    paintLightBetween(from, to, radius);

    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      clearVisibilityAt(visibility, from.x + dx * t, from.y + dy * t, radius, lastWidth, lastHeight);
    }
  }

  function resetLightMap() {
    lightDecayFill.clear();
    app.renderer.render({
      container: lightDecayFill,
      target: lightTexture,
      clear: true
    });
    app.renderer.render({
      container: lightDecayFill,
      target: nextLightTexture,
      clear: true
    });
  }

  function updateVisualLightMap(width: number, height: number, dt: number, state: GameState) {
    if (state.phase === 'dawn' || state.phase === 'won') {
      const alpha = Math.min(0.72, dt * 7.5);
      lightDecayFill.clear().rect(0, 0, width, height).fill({ color: 0xffffff, alpha });
      lightDecayFill.blendMode = 'normal';
      app.renderer.render({
        container: lightDecayFill,
        target: lightTexture,
        clear: false
      });
      return;
    } else {
      const nightProgress = clamp01(state.elapsed / NIGHT_FALL_SECONDS);
      const retain = Math.exp(-(0.22 + nightProgress * 0.52) * dt);
      lightCopySprite.texture = lightTexture;
      lightCopySprite.alpha = retain;
      lightCopySprite.width = width;
      lightCopySprite.height = height;
      lightCopySprite.blendMode = 'normal';

      app.renderer.render({
        container: lightCopySprite,
        target: nextLightTexture,
        clear: true
      });

      const previous = lightTexture;
      lightTexture = nextLightTexture;
      nextLightTexture = previous;
      lightSprite.texture = lightTexture;
      return;
    }
  }

  function paintLightAt(x: number, y: number, radius = BRUSH_RADIUS) {
    lightBrush.clear().circle(0, 0, radius).fill({ color: 0xffffff, alpha: 0.72 });
    lightBrush.position.set(x, y);
    lightBrush.blendMode = 'normal';
    app.renderer.render({
      container: lightBrush,
      target: lightTexture,
      clear: false
    });
  }

  function paintLightBetween(from: PointerSample, to: PointerSample, radius = BRUSH_RADIUS) {
    lightLine.clear().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({
      width: radius * 1.38,
      color: 0xffffff,
      alpha: 0.74,
      cap: 'round',
      join: 'round'
    });
    lightLine.blendMode = 'normal';
    app.renderer.render({
      container: lightLine,
      target: lightTexture,
      clear: false
    });
  }

  function syncLightMask() {
    if (revealedLayer && lightSprite) {
      revealedLayer.mask = lightSprite;
    }
  }

  function handlePointerMove(event: FederatedPointerEvent) {
    const sample = { x: event.global.x, y: event.global.y } satisfies PointerSample;
    const previous = activePointers.get(event.pointerId) ?? (event.pointerType === 'mouse' ? lastPoint : null);

    if (event.pointerType === 'mouse' || activePointers.has(event.pointerId)) {
      if (previous) {
        clearBetweenPoints(previous, sample);
      } else {
        clearAtPoint(sample.x, sample.y);
      }
    }

    activePointers.set(event.pointerId, sample);
    lastPoint = sample;
  }

  function handlePointerDown(event: FederatedPointerEvent) {
    if (game.phase !== 'running') {
      resetGame(game);
      resetVisibility(visibility);
      resetLightMap();
      activePointers.clear();
      lastPoint = null;
      return;
    }

    activePointers.set(event.pointerId, { x: event.global.x, y: event.global.y });
    lastPoint = { x: event.global.x, y: event.global.y };
    clearAtPoint(event.global.x, event.global.y);
  }

  function handlePointerUp(event: FederatedPointerEvent) {
    activePointers.delete(event.pointerId);
    if (event.pointerType !== 'mouse') {
      lastPoint = null;
    }
  }

  return (
    <Container
      ref={(container) => {
        rootLayer = container;
      }}
      eventMode="static"
      interactive
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerupoutside={handlePointerUp}
      onpointercancel={handlePointerUp}
    >
      <Graphics
        ref={(graphics) => {
          fieldGraphics = graphics;
        }}
      />
      <Graphics
        ref={(graphics) => {
          enemyGraphics = graphics;
        }}
      />
      <Graphics
        ref={(graphics) => {
          darknessGraphics = graphics;
        }}
      />
      <Sprite
        ref={(sprite) => {
          lightSprite = sprite;
          syncLightMask();
        }}
        texture={lightTexture}
        renderable={false}
      />
      <Container
        ref={(container) => {
          revealedLayer = container;
          syncLightMask();
        }}
      >
        <Graphics
          ref={(graphics) => {
            revealedFieldGraphics = graphics;
          }}
        />
        <Graphics
          ref={(graphics) => {
            revealedTowerGraphics = graphics;
          }}
        />
        <Graphics
          ref={(graphics) => {
            revealedEnemyGraphics = graphics;
          }}
        />
        <Graphics
          ref={(graphics) => {
            revealedShotGraphics = graphics;
          }}
        />
        <Graphics
          ref={(graphics) => {
            revealedEffectGraphics = graphics;
          }}
        />
      </Container>
      <Graphics
        ref={(graphics) => {
          towerGraphics = graphics;
        }}
      />
      <Graphics
        ref={(graphics) => {
          shotGraphics = graphics;
        }}
      />
      <Graphics
        ref={(graphics) => {
          effectGraphics = graphics;
        }}
      />
      <Text
        ref={(text) => {
          hudText = text;
        }}
        x={22}
        y={18}
        style={
          new TextStyle({
            fill: '#dcefe8',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 16,
            fontWeight: '700',
            letterSpacing: 0,
            lineHeight: 22,
            stroke: { color: '#06100d', width: 4 }
          })
        }
      />
      <Text
        ref={(text) => {
          statusText = text;
        }}
        anchor={0.5}
        style={
          new TextStyle({
            align: 'center',
            fill: '#f8fffb',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 30,
            fontWeight: '800',
            letterSpacing: 0,
            stroke: { color: '#030605', width: 8 }
          })
        }
      />
    </Container>
  );

  function renderScene(state: GameState, grid: VisibilityGrid, width: number, height: number) {
    const tower = towerPosition(width, height);
    drawField(fieldGraphics, width, height, state.elapsed);
    drawTower(towerGraphics, tower.x, tower.y, state.towerHp, state.aimTargetId, state.enemies);
    drawEnemies(enemyGraphics, state.enemies, grid, width, height);
    drawShots(shotGraphics, state.shots);
    drawSparks(effectGraphics, state.sparks);
    drawDarkness(darknessGraphics, state, width, height);
    drawField(revealedFieldGraphics, width, height, state.elapsed);
    drawTower(revealedTowerGraphics, tower.x, tower.y, state.towerHp, state.aimTargetId, state.enemies);
    drawEnemies(revealedEnemyGraphics, state.enemies, grid, width, height, true);
    drawShots(revealedShotGraphics, state.shots);
    drawSparks(revealedEffectGraphics, state.sparks);
    drawHud(hudText, state);
    drawStatus(statusText, state, width, height);
  }
}

function createInitialGameState(): GameState {
  return {
    elapsed: 0,
    towerHp: TOWER_MAX_HP,
    kills: 0,
    spawnTimer: 1.2,
    fireTimer: 0,
    nextEnemyId: 1,
    nextShotId: 1,
    phase: 'running',
    aimTargetId: null,
    bossSpawned: false,
    bossDefeatedAt: null,
    dawnStartedAt: null,
    enemies: [],
    shots: [],
    sparks: []
  };
}

function resetGame(state: GameState) {
  const next = createInitialGameState();

  state.elapsed = next.elapsed;
  state.towerHp = next.towerHp;
  state.kills = next.kills;
  state.spawnTimer = next.spawnTimer;
  state.fireTimer = next.fireTimer;
  state.nextEnemyId = next.nextEnemyId;
  state.nextShotId = next.nextShotId;
  state.phase = next.phase;
  state.aimTargetId = next.aimTargetId;
  state.bossSpawned = next.bossSpawned;
  state.bossDefeatedAt = next.bossDefeatedAt;
  state.dawnStartedAt = next.dawnStartedAt;
  state.enemies.length = 0;
  state.shots.length = 0;
  state.sparks.length = 0;
}

function updateGame(state: GameState, visibility: VisibilityGrid, width: number, height: number, dt: number) {
  state.elapsed += dt;
  state.spawnTimer -= dt;
  state.fireTimer -= dt;

  if (!state.bossSpawned && state.elapsed >= BOSS_SPAWN_SECONDS) {
    spawnBoss(state, width, height);
  }

  if (
    state.phase === 'running' &&
    state.bossDefeatedAt === null &&
    state.spawnTimer <= 0 &&
    state.enemies.length < MAX_ENEMIES
  ) {
    spawnEnemy(state, width, height);
    const pressure = clamp01(state.elapsed / WAVE_RAMP_SECONDS);
    state.spawnTimer = 1.2 - pressure * 0.54 + Math.random() * 0.36;
  }

  if (
    state.phase === 'running' &&
    state.bossDefeatedAt !== null &&
    state.elapsed - state.bossDefeatedAt >= DAWN_AFTER_BOSS_SECONDS
  ) {
    state.phase = 'dawn';
    state.dawnStartedAt = state.elapsed;
    state.fireTimer = 0;
  }

  updateEnemies(state, width, height, dt);
  updateShots(state, dt);
  updateSparks(state, dt);
  fireTower(state, visibility, width, height);

  if (state.towerHp <= 0) {
    state.phase = 'lost';
  } else if (state.phase === 'dawn' && state.enemies.length === 0) {
    state.phase = 'won';
  }
}

function spawnEnemy(state: GameState, width: number, height: number) {
  const edge = Math.random();
  const topSpawn = edge < 0.72;
  const sideSpawn = edge >= 0.72 && edge < 0.91;
  const wave = clamp01(state.elapsed / WAVE_RAMP_SECONDS);
  const x = topSpawn ? 34 + Math.random() * Math.max(1, width - 68) : sideSpawn ? -24 : width + 24;
  const y = topSpawn ? -28 : 48 + Math.random() * Math.max(1, height * 0.62);
  const kind = pickEnemyKind(wave);

  state.enemies.push(createEnemy(state, kind, x, y, width, height, wave));
}

function spawnBoss(state: GameState, width: number, height: number) {
  state.bossSpawned = true;
  state.enemies.push(createEnemy(state, 'boss', width / 2, -70, width, height, 1));
  state.sparks.push({
    x: width / 2,
    y: 80,
    life: 1.2,
    maxLife: 1.2,
    color: 0xf97316
  });
}

function pickEnemyKind(wave: number): EnemyKind {
  const roll = Math.random();

  if (wave > 0.62 && roll < 0.18) {
    return 'charger';
  }

  if (roll < 0.28) {
    return 'zigzag';
  }

  if (roll < 0.5) {
    return 'arc';
  }

  return 'straight';
}

function createEnemy(
  state: GameState,
  kind: EnemyKind,
  x: number,
  y: number,
  width: number,
  height: number,
  wave: number
): Enemy {
  const tower = towerPosition(width, height);
  const distance = Math.max(1, Math.hypot(tower.x - x, tower.y - y));
  const radius = enemyRadius(kind);
  const hp = enemyHp(kind, wave, radius);

  return {
    id: state.nextEnemyId++,
    kind,
    spawnX: x,
    spawnY: y,
    pathDistance: distance,
    swayPhase: Math.random() * Math.PI * 2,
    swaySign: Math.random() > 0.5 ? 1 : -1,
    x,
    y,
    age: 0,
    radius,
    speed: enemySpeed(kind, wave),
    hp,
    maxHp: hp,
    damage: enemyDamage(kind, wave)
  } satisfies Enemy;
}

function enemyRadius(kind: EnemyKind) {
  switch (kind) {
    case 'straight':
      return 11 + Math.random() * 6;
    case 'zigzag':
      return 10 + Math.random() * 5;
    case 'arc':
      return 12 + Math.random() * 6;
    case 'charger':
      return 9 + Math.random() * 4;
    case 'boss':
      return 42;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function enemySpeed(kind: EnemyKind, wave: number) {
  switch (kind) {
    case 'straight':
      return 40 + wave * 30 + Math.random() * 16;
    case 'zigzag':
      return 37 + wave * 28 + Math.random() * 14;
    case 'arc':
      return 34 + wave * 25 + Math.random() * 12;
    case 'charger':
      return 66 + wave * 34 + Math.random() * 18;
    case 'boss':
      return 42;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function enemyHp(kind: EnemyKind, wave: number, radius: number) {
  switch (kind) {
    case 'straight':
      return 66 + wave * 72 + radius * 1.35;
    case 'zigzag':
      return 58 + wave * 64 + radius * 1.25;
    case 'arc':
      return 78 + wave * 82 + radius * 1.45;
    case 'charger':
      return 52 + wave * 58 + radius * 1.25;
    case 'boss':
      return 6200;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function enemyDamage(kind: EnemyKind, wave: number) {
  switch (kind) {
    case 'straight':
      return 5 + Math.round(wave * 6);
    case 'zigzag':
      return 5 + Math.round(wave * 5);
    case 'arc':
      return 7 + Math.round(wave * 7);
    case 'charger':
      return 8 + Math.round(wave * 8);
    case 'boss':
      return TOWER_MAX_HP;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function updateEnemies(state: GameState, width: number, height: number, dt: number) {
  const tower = towerPosition(width, height);

  for (let index = state.enemies.length - 1; index >= 0; index--) {
    const enemy = state.enemies[index];

    if (!enemy) {
      continue;
    }

    enemy.age += dt;
    const dx = tower.x - enemy.x;
    const dy = tower.y - enemy.y;
    const distance = Math.max(Math.hypot(dx, dy), 0.001);
    const forwardX = dx / distance;
    const forwardY = dy / distance;
    const lateral = enemyLateralVelocity(enemy, distance);
    const speed = enemyForwardSpeed(enemy);

    enemy.x += (forwardX * speed + -forwardY * lateral) * dt;
    enemy.y += (forwardY * speed + forwardX * lateral) * dt;

    if (distance <= TOWER_RADIUS + enemy.radius + 3) {
      state.towerHp = Math.max(0, state.towerHp - enemy.damage);
      state.sparks.push({
        x: tower.x + (Math.random() - 0.5) * 42,
        y: tower.y + (Math.random() - 0.5) * 34,
        life: 0.32,
        maxLife: 0.32,
        color: 0xffd166
      });
      state.enemies.splice(index, 1);
    }
  }
}

function enemyForwardSpeed(enemy: Enemy) {
  if (enemy.kind !== 'charger') {
    return enemy.speed;
  }

  return enemy.speed * (1.05 + Math.max(0, Math.sin(enemy.age * 5.2 + enemy.swayPhase)) * 0.28);
}

function enemyLateralVelocity(enemy: Enemy, distanceToTower: number) {
  const progress = clamp01(1 - distanceToTower / enemy.pathDistance);

  switch (enemy.kind) {
    case 'straight':
      return 0;
    case 'zigzag':
      return Math.sin(enemy.age * 5.6 + enemy.swayPhase) * enemy.speed * 0.9;
    case 'arc':
      return Math.sin(progress * Math.PI) * enemy.swaySign * enemy.speed * 0.95;
    case 'charger':
      return Math.sin(enemy.age * 7.4 + enemy.swayPhase) * enemy.speed * 0.25;
    case 'boss':
      return Math.sin(enemy.age * 1.6 + enemy.swayPhase) * enemy.speed * 0.42;
    default: {
      const exhaustive: never = enemy.kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function updateShots(state: GameState, dt: number) {
  for (let index = state.shots.length - 1; index >= 0; index--) {
    const shot = state.shots[index];

    if (!shot) {
      continue;
    }

    const fromX = shot.x;
    const fromY = shot.y;
    const targetIndex =
      shot.targetId === null ? -1 : state.enemies.findIndex((enemy) => enemy.id === shot.targetId);

    if (targetIndex >= 0) {
      const target = state.enemies[targetIndex];

      if (target) {
        const dx = target.x - shot.x;
        const dy = target.y - shot.y;
        const distance = Math.max(Math.hypot(dx, dy), 0.001);
        const travel = shot.speed * dt;

        shot.vx = (dx / distance) * shot.speed;
        shot.vy = (dy / distance) * shot.speed;

        if (distance <= travel + target.radius + SHOT_HIT_PADDING) {
          shot.x = target.x;
          shot.y = target.y;
          applyShotHit(state, shot, targetIndex, target.x, target.y);
          state.shots.splice(index, 1);
          continue;
        }
      }
    }

    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    const hit = findShotCollision(state.enemies, fromX, fromY, shot.x, shot.y);

    if (hit) {
      applyShotHit(state, shot, hit.index, hit.x, hit.y);
      state.shots.splice(index, 1);
    } else if (shot.life <= 0) {
      state.shots.splice(index, 1);
    }
  }
}

type ShotCollision = {
  index: number;
  x: number;
  y: number;
  t: number;
};

function findShotCollision(
  enemies: readonly Enemy[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): ShotCollision | null {
  let collision: ShotCollision | null = null;
  const segmentX = toX - fromX;
  const segmentY = toY - fromY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  for (let index = 0; index < enemies.length; index++) {
    const enemy = enemies[index];

    if (!enemy) {
      continue;
    }

    const rawT =
      segmentLengthSquared <= 0
        ? 1
        : ((enemy.x - fromX) * segmentX + (enemy.y - fromY) * segmentY) / segmentLengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const closestX = fromX + segmentX * t;
    const closestY = fromY + segmentY * t;
    const dx = enemy.x - closestX;
    const dy = enemy.y - closestY;
    const hitRadius = enemy.radius + SHOT_HIT_PADDING;

    if (dx * dx + dy * dy > hitRadius * hitRadius) {
      continue;
    }

    if (!collision || t < collision.t) {
      collision = {
        index,
        x: closestX,
        y: closestY,
        t
      };
    }
  }

  return collision;
}

function applyShotHit(state: GameState, shot: Shot, enemyIndex: number, x: number, y: number) {
  const enemy = state.enemies[enemyIndex];

  if (!enemy) {
    return;
  }

  enemy.hp -= shot.damage;
  applyShotKnockback(enemy, shot);
  state.sparks.push({
    x,
    y,
    life: 0.22,
    maxLife: 0.22,
    color: 0xa7f3d0
  });

  if (enemy.hp <= 0) {
    if (enemy.kind === 'boss' && state.bossDefeatedAt === null) {
      state.bossDefeatedAt = state.elapsed;
      state.fireTimer = 0;
    }

    state.kills += 1;
    state.sparks.push({
      x: enemy.x,
      y: enemy.y,
      life: 0.44,
      maxLife: 0.44,
      color: 0xfca5a5
    });
    state.enemies.splice(enemyIndex, 1);
  }
}

function applyShotKnockback(enemy: Enemy, shot: Shot) {
  const velocityLength = Math.max(Math.hypot(shot.vx, shot.vy), 0.001);
  const distance = enemy.kind === 'boss' ? BOSS_SHOT_KNOCKBACK : SHOT_KNOCKBACK;

  enemy.x += (shot.vx / velocityLength) * distance;
  enemy.y += (shot.vy / velocityLength) * distance;
}

function updateSparks(state: GameState, dt: number) {
  for (let index = state.sparks.length - 1; index >= 0; index--) {
    const spark = state.sparks[index];

    if (!spark) {
      continue;
    }

    spark.life -= dt;

    if (spark.life <= 0) {
      state.sparks.splice(index, 1);
    }
  }
}

function fireTower(state: GameState, visibility: VisibilityGrid, width: number, height: number) {
  const tower = towerPosition(width, height);
  const target = findTowerTarget(state, visibility, tower.x, tower.y, width, height);

  state.aimTargetId = target?.id ?? null;

  if (!target || state.fireTimer > 0) {
    return;
  }

  const dawn = state.phase === 'dawn';
  const speed = dawn ? 3400 : 1700;
  const damage = dawn ? 9999 : 42;
  const shotX = tower.x;
  const shotY = tower.y - 14;
  const dx = target.x - shotX;
  const dy = target.y - shotY;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);

  state.shots.push({
    id: state.nextShotId++,
    targetId: target.id,
    x: shotX,
    y: shotY,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    speed,
    life: distance / speed + 0.7,
    damage
  });
  state.fireTimer = dawn ? DAWN_FIRE_INTERVAL : TOWER_FIRE_INTERVAL;
}

function findTowerTarget(
  state: GameState,
  visibility: VisibilityGrid,
  towerX: number,
  towerY: number,
  width: number,
  height: number
) {
  let target: Enemy | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - towerX, enemy.y - towerY);

    if (
      state.phase !== 'dawn' &&
      sampleVisibility(visibility, enemy.x, enemy.y, width, height) < TARGET_VISIBILITY_THRESHOLD
    ) {
      continue;
    }

    const bossPriority = enemy.kind === 'boss' ? 1200 : 0;
    const score = distance - bossPriority;

    if (score < bestScore) {
      target = enemy;
      bestScore = score;
    }
  }

  return target;
}

function resetVisibility(grid: VisibilityGrid) {
  grid.values.fill(1);
}

function updateTargetVisibility(grid: VisibilityGrid, dt: number, state: GameState) {
  if (state.phase === 'dawn' || state.phase === 'won') {
    for (let index = 0; index < grid.values.length; index++) {
      grid.values[index] = Math.min(1, (grid.values[index] ?? 0) + dt * 1.35);
    }

    return;
  }

  const nightProgress = clamp01(state.elapsed / NIGHT_FALL_SECONDS);
  const factor = Math.exp(-(0.16 + nightProgress * 0.38) * dt);

  for (let index = 0; index < grid.values.length; index++) {
    grid.values[index] *= factor;
  }
}

function clearVisibilityAt(grid: VisibilityGrid, x: number, y: number, radius: number, width: number, height: number) {
  const centerX = Math.floor((x / width) * grid.width);
  const centerY = Math.floor((y / height) * grid.height);
  const radiusX = Math.ceil((radius / width) * grid.width);
  const radiusY = Math.ceil((radius / height) * grid.height);

  for (let row = centerY - radiusY; row <= centerY + radiusY; row++) {
    if (row < 0 || row >= grid.height) {
      continue;
    }

    for (let col = centerX - radiusX; col <= centerX + radiusX; col++) {
      if (col < 0 || col >= grid.width) {
        continue;
      }

      const worldX = ((col + 0.5) / grid.width) * width;
      const worldY = ((row + 0.5) / grid.height) * height;
      const distance = Math.hypot(worldX - x, worldY - y);

      if (distance > radius) {
        continue;
      }

      const softness = 1 - distance / radius;
      const value = 0.36 + softness * 0.64;
      const index = row * grid.width + col;
      grid.values[index] = Math.max(grid.values[index] ?? 0, value);
    }
  }
}

function sampleVisibility(grid: VisibilityGrid, x: number, y: number, width: number, height: number) {
  const col = Math.max(0, Math.min(grid.width - 1, Math.floor((x / width) * grid.width)));
  const row = Math.max(0, Math.min(grid.height - 1, Math.floor((y / height) * grid.height)));

  return grid.values[row * grid.width + col] ?? 0;
}

function drawField(graphics: PixiGraphics, width: number, height: number, elapsed: number) {
  const pulse = 0.5 + Math.sin(elapsed * 0.42) * 0.5;

  graphics.clear();
  graphics.rect(0, 0, width, height).fill({ color: 0x17251d });
  graphics.rect(0, height * 0.68, width, height * 0.32).fill({ color: 0x10201a, alpha: 0.88 });

  for (let x = 42; x < width; x += 76) {
    graphics.moveTo(x, 0).lineTo(x + 18, height).stroke({ width: 1, color: 0x2c4535, alpha: 0.12 });
  }

  for (let y = 54; y < height; y += 74) {
    graphics.moveTo(0, y).lineTo(width, y + 14).stroke({ width: 1, color: 0x375742, alpha: 0.1 });
  }

  graphics.circle(width * 0.5, height - 90, Math.max(width, height)).stroke({
    width: 2,
    color: 0x86efac,
    alpha: 0.025 + pulse * 0.018
  });
}

function drawTower(
  graphics: PixiGraphics,
  x: number,
  y: number,
  hp: number,
  aimTargetId: number | null,
  enemies: readonly Enemy[]
) {
  const target = aimTargetId === null ? null : enemies.find((enemy) => enemy.id === aimTargetId) ?? null;

  graphics.clear();

  if (target) {
    graphics.moveTo(x, y - 14).lineTo(target.x, target.y).stroke({ width: 2, color: 0xbfffe0, alpha: 0.32 });
  }

  graphics.circle(x, y, 35).fill({ color: 0x07100c, alpha: 0.92 });
  graphics.circle(x, y, 30).stroke({ width: 3, color: 0xc7f9dc, alpha: 0.7 });
  graphics.roundRect(x - 7, y - 29, 14, 28, 7).fill({ color: 0x0b1d15, alpha: 0.95 });
  graphics.roundRect(x - 4, y - 34, 8, 26, 4).fill({ color: 0x9be7c0, alpha: 0.84 });
  graphics.circle(x, y, 19).fill({ color: 0x22c55e });
  graphics.circle(x - 7, y - 9, 6).fill({ color: 0xd1fae5, alpha: 0.75 });
  graphics.circle(x, y - 30, 4).fill({ color: 0xd1fae5, alpha: 0.86 });

  const hpWidth = 84;
  graphics.roundRect(x - hpWidth / 2, y + 44, hpWidth, 8, 4).fill({ color: 0x05100c, alpha: 0.86 });
  graphics.roundRect(x - hpWidth / 2, y + 44, hpWidth * clamp01(hp / TOWER_MAX_HP), 8, 4).fill({
    color: hp > 35 ? 0x34d399 : 0xf97316
  });
}

function drawEnemies(
  graphics: PixiGraphics,
  enemies: readonly Enemy[],
  visibility: VisibilityGrid,
  width: number,
  height: number,
  forceVisible = false
) {
  graphics.clear();

  for (const enemy of enemies) {
    const visible = forceVisible ? 1 : sampleVisibility(visibility, enemy.x, enemy.y, width, height);
    const alpha = enemy.kind === 'boss' ? 0.08 + visible * 0.92 : 0.035 + visible * 0.965;
    const health = clamp01(enemy.hp / enemy.maxHp);
    const color = enemyColor(enemy.kind);
    const eyeColor = enemy.kind === 'boss' ? 0xffedd5 : 0xfff1f2;

    graphics.circle(enemy.x, enemy.y, enemy.radius + 4).fill({ color: 0x050806, alpha: alpha * 0.42 });
    graphics.circle(enemy.x, enemy.y, enemy.radius).fill({ color, alpha });
    if (enemy.kind === 'arc') {
      graphics.circle(enemy.x, enemy.y, enemy.radius * 0.55).stroke({ color: 0xfef08a, alpha: alpha * 0.52, width: 2 });
    } else if (enemy.kind === 'zigzag') {
      graphics
        .moveTo(enemy.x - enemy.radius * 0.72, enemy.y)
        .lineTo(enemy.x, enemy.y - enemy.radius * 0.42)
        .lineTo(enemy.x + enemy.radius * 0.72, enemy.y)
        .stroke({ color: 0xfda4af, alpha: alpha * 0.72, width: 2 });
    } else if (enemy.kind === 'charger') {
      graphics
        .moveTo(enemy.x + enemy.radius * 0.72, enemy.y)
        .lineTo(enemy.x - enemy.radius * 0.38, enemy.y - enemy.radius * 0.5)
        .lineTo(enemy.x - enemy.radius * 0.38, enemy.y + enemy.radius * 0.5)
        .closePath()
        .fill({ color: 0xffedd5, alpha: alpha * 0.28 });
    } else if (enemy.kind === 'boss') {
      graphics.circle(enemy.x, enemy.y, enemy.radius + 10).stroke({ color: 0xfb923c, alpha: alpha * 0.58, width: 4 });
    }
    graphics.circle(enemy.x - enemy.radius * 0.28, enemy.y - enemy.radius * 0.25, enemy.radius * 0.23).fill({
      color: eyeColor,
      alpha: alpha * 0.85
    });
    graphics
      .moveTo(enemy.x - enemy.radius, enemy.y + enemy.radius + 5)
      .lineTo(enemy.x - enemy.radius + enemy.radius * 2 * health, enemy.y + enemy.radius + 5)
      .stroke({ width: 3, color: 0xfda4af, alpha: alpha * 0.72 });
  }
}

function enemyColor(kind: EnemyKind) {
  switch (kind) {
    case 'straight':
      return 0xdc2626;
    case 'zigzag':
      return 0xe11d48;
    case 'arc':
      return 0xc2410c;
    case 'charger':
      return 0xf97316;
    case 'boss':
      return 0x7f1d1d;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled enemy kind: ${exhaustive}`);
    }
  }
}

function drawShots(graphics: PixiGraphics, shots: readonly Shot[]) {
  graphics.clear();

  for (const shot of shots) {
    graphics.circle(shot.x, shot.y, 4).fill({ color: 0xd1fae5, alpha: 0.94 });
    graphics.circle(shot.x, shot.y, 9).fill({ color: 0x34d399, alpha: 0.16 });
  }
}

function drawSparks(graphics: PixiGraphics, sparks: readonly Spark[]) {
  graphics.clear();

  for (const spark of sparks) {
    const t = clamp01(spark.life / spark.maxLife);
    graphics.circle(spark.x, spark.y, 18 * (1 - t) + 3).stroke({ width: 2, color: spark.color, alpha: t });
  }
}

function drawDarkness(graphics: PixiGraphics, state: GameState, width: number, height: number) {
  graphics.clear();

  const nightAlpha = 0.42 + clamp01(state.elapsed / NIGHT_FALL_SECONDS) * 0.57;
  const dawnFade = state.phase === 'dawn' || state.phase === 'won' ? dawnProgress(state) : 0;
  const alpha = nightAlpha * (1 - dawnFade);

  if (alpha <= 0.01) {
    return;
  }

  graphics.rect(0, 0, width, height).fill({ color: 0x010302, alpha });
}

function drawHud(text: PixiText, state: GameState) {
  const night = Math.round(clamp01(state.elapsed / NIGHT_FALL_SECONDS) * 100);
  const phase = hudPhase(state);

  text.text = `Night ${night}%\nTower ${Math.ceil(state.towerHp)}\nKills ${state.kills}\n${phase}`;
}

function hudPhase(state: GameState) {
  if (state.phase === 'dawn') {
    return 'Dawn fire';
  }

  if (state.phase === 'won') {
    return 'Dawn';
  }

  if (state.bossDefeatedAt !== null) {
    const remaining = Math.max(0, Math.ceil(DAWN_AFTER_BOSS_SECONDS - (state.elapsed - state.bossDefeatedAt)));
    return `Dawn ${remaining}s`;
  }

  if (!state.bossSpawned) {
    const remaining = Math.max(0, Math.ceil(BOSS_SPAWN_SECONDS - state.elapsed));
    return `Boss ${remaining}s`;
  }

  return 'Boss alive';
}

function drawStatus(text: PixiText, state: GameState, width: number, height: number) {
  text.x = width / 2;
  text.y = height * 0.44;

  if (state.phase === 'won') {
    text.visible = true;
    text.text = `DAWN HOLDS\n${state.kills} cleared`;
  } else if (state.phase === 'lost') {
    text.visible = true;
    text.text = `TOWER LOST\n${state.kills} cleared`;
  } else {
    text.visible = false;
  }
}

function towerPosition(width: number, height: number) {
  return {
    x: width / 2,
    y: Math.max(120, height - 88)
  } as const;
}

function sceneWidth(width: number) {
  return Math.max(1, Math.floor(width));
}

function sceneHeight(height: number) {
  return Math.max(1, Math.floor(height));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function dawnProgress(state: GameState) {
  if (state.dawnStartedAt === null) {
    return 0;
  }

  return clamp01((state.elapsed - state.dawnStartedAt) / DAWN_CLEAR_SECONDS);
}
