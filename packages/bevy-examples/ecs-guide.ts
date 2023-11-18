import { App, Commands, World, inSet } from 'packages/bevy/app';
import { Last, Startup, Update } from 'packages/bevy/schedules';

const randomBool = () => (Math.random() > 0.5 ? true : false);

function scheduleRunnerPlugin(app: App) {
  app.setRunner(() => {
    const step = () => {
      const startTime = performance.now();

      if (app.world.resources[AppExit]) {
        throw Error('EXIT');
      }

      app.update();

      const endTime = performance.now();

      setTimeout(() => {
        requestAnimationFrame(step);
      }, 5000);
    };

    requestAnimationFrame(step);
  });
}

const AppExit = Symbol('AppExit');
interface AppExit {
  value: boolean;
}

const GameState = Symbol('GameState');
interface GameState {
  currentRound: number;
  totalPlayers: number;
  winningPlayer?: string;
}

const GameRules = Symbol('GameRules');
interface GameRules {
  winningScore: number;
  maxRounds: number;
  maxPlayers: number;
}

function printMessageSystem() {
  console.log('This game is fun!');
}

function scoreSystem(query: { player: string; score: number }[]) {
  for (const item of query) {
    const scoredPoint = randomBool();
    if (scoredPoint) {
      item.score += 1;
      console.log(
        `${item.player} scored a point! Their score is: ${item.score}`
      );
    } else {
      console.log(
        `${item.player} did not score a point! Their score is: ${item.score}`
      );
    }
  }
}

function scoreCheckSystem(
  gameRules: GameRules,
  gameState: GameState,
  query: { player: string; score: number }[]
) {
  for (const item of query) {
    if (item.score == gameRules.winningScore) {
      gameState.winningPlayer = item.player;
    }
  }
}

function gameOverSystem(
  gameRules: GameRules,
  gameState: GameState,
  appExitEvents: AppExit
) {
  const player = gameState.winningPlayer;
  if (player !== undefined) {
    console.log(`${player} won the game!`);

    appExitEvents.value = true;
  } else if (gameState.currentRound == gameRules.maxRounds) {
    console.log('Ran out of rounds. Nobody wins!');
    appExitEvents.value = true;
  }
}

function startupSystemGet(world: World) {
  startupSystem(world.resources.commands, world.resources[GameState]);
}

function startupSystem(commands: Commands, gameState: GameState) {
  commands.insertResource(GameRules, {
    maxRounds: 10,
    winningScore: 4,
    maxPlayers: 4,
  });

  commands.spawn([
    {
      player: 'Alice',
      score: 0,
    },
    {
      name: 'Bob',
      score: 0,
    },
  ]);

  gameState.totalPlayers = 2;
}

function newPlayerSystem(
  commands: Commands,
  gameRules: GameRules,
  gameState: GameState
) {
  const addNewPlayer = randomBool();
  if (addNewPlayer && gameState.totalPlayers < gameRules.maxPlayers) {
    gameState.totalPlayers += 1;
    commands.spawn({
      player: `Player ${gameState.totalPlayers}`,
      score: 0,
    });

    console.log(`Player ${gameState.totalPlayers} joined the game!`);
  }
}

function exclusivePlayerSystem(world: World) {
  const totalPlayers = (world.resources[GameState] as GameState).totalPlayers;
  const gameRules = world.resources[GameRules] as GameRules;
  const addNewPlayer = randomBool();
  const shouldAddPlayer = addNewPlayer && totalPlayers < gameRules.maxPlayers;

  if (shouldAddPlayer) {
    console.log(`Player ${totalPlayers + 1} has joined the game!`);
    world.spawn({
      player: `Player ${totalPlayers + 1}`,
      score: 0,
    });

    const gameState = world.resources[GameState] as GameState;
    gameState.totalPlayers += 1;
  }
}

let counter = 0;
function printAtEndRound() {
  counter += 1;
  console.log(`In set 'Last' for the ${counter}th time`);
}

function newRoundSystem(gameRules: GameRules, gameState: GameState) {
  gameState.currentRound += 1;
  console.log(
    `Begin round ${gameState.currentRound} of ${gameRules.maxRounds}`
  );
}

enum MySet {
  BeforeRound,
  Round,
  AfterRound,
}

function main() {
  const app = new App();
  app.addPlugin(scheduleRunnerPlugin);
  app.initResource({
    [GameState]: {
      currentRound: 0,
      totalPlayers: 0,
      winningPlayer: undefined,
    },
    [AppExit]: { value: false },
  });
  app.addSystems(Startup, startupSystem);
  app.addSystems(Update, printMessageSystem);
  app.addSystems(Last, printAtEndRound);
  app.configureSets(Update, [MySet.BeforeRound, MySet.Round, MySet.AfterRound]);
  app.addSystems(
    Update,
    inSet(
      MySet.BeforeRound,
      newRoundSystem,
      newPlayerSystem,
      exclusivePlayerSystem
    ),
    inSet(MySet.Round, scoreSystem),
    inSet(MySet.AfterRound, scoreCheckSystem, gameOverSystem)
  );
  app.run();
}

main();
