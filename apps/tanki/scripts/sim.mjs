// Plays many eight-bot king of the hill matches headless, spread over worker processes, and adds
// up what the balance harness counts in each (see the `plays eight-bot matches` part of
// src/koth/classes/balance.harness.test.ts). The harness itself runs one shard of seeds per
// process, at about twenty times real time on a core; this spreads the seeds over the cores.
//
//   pnpm sim [--seeds 36] [--first 11] [--workers N] [--tuning FILE|JSON] [--roster a,b,c,d[/e,f,g,h]] [--out FILE]
//
// --seeds   how many matches, one per seed; seeds are the primes from --first on.
// --workers processes at once; defaults to the cores but two.
// --tuning  a tuning exported from the pause menu's class editor, as a file or its JSON or link.
// --roster  the classes of both teams, which bots then keep.
// --out     writes the summed counts and the tables as JSON to this file.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASSES = ['scout', 'soldier', 'heavy', 'demoman', 'sniper'];
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = readOptions(process.argv.slice(2));
const seeds = primesFrom(Number(options.first ?? 11), Number(options.seeds ?? 36));
const workers = Math.max(1, Math.min(Number(options.workers ?? availableParallelism() - 2), seeds.length));
const shards = Array.from({ length: workers }, (_, index) => seeds.filter((_, seed) => seed % workers === index));
const started = Date.now();

const results = await Promise.all(shards.map((shard) => runShard(shard)));
const summary = merge(results);
console.log(report(summary, (Date.now() - started) / 1000));

if (options.out) {
  writeFileSync(options.out, JSON.stringify(summary, null, 2));
}

/** Runs the harness's full matches for `shard` in its own process and returns its raw counts. */
function runShard(shard) {
  return new Promise((done, fail) => {
    const env = { ...process.env, TANKI_BALANCE: '1', TANKI_RESULT: '1', TANKI_SEEDS: shard.join(',') };

    if (options.tuning) {
      env.TANKI_TUNING = options.tuning;
    }

    if (options.roster) {
      env.TANKI_ROSTER = options.roster;
    }

    const child = spawn('pnpm', ['exec', 'vitest', 'run', 'src/koth/classes/balance.harness.test.ts', '-t', 'matches', '--reporter=verbose'], { cwd: app, env });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => {
      const line = output.split('\n').find((text) => text.startsWith('TANKI_RESULT '));

      if (code !== 0 || !line) {
        fail(new Error(`shard ${shard.join(',')} failed (exit ${code}):\n${output.slice(-2000)}`));
      } else {
        done(JSON.parse(line.slice('TANKI_RESULT '.length)));
      }
    });
  });
}

/** Adds the shards' raw counts up. */
function merge(results) {
  const totals = {};
  const wins = { red: 0, blue: 0, none: 0 };
  let stalls = 0;
  let longest = 0;
  const matches = [];

  for (const result of results) {
    for (const side of Object.keys(wins)) {
      wins[side] += result.wins[side];
    }

    stalls += result.stalls;
    longest = Math.max(longest, result.longest);
    matches.push(...result.matches);

    for (const [id, tally] of Object.entries(result.totals)) {
      totals[id] ??= {};

      for (const [key, value] of Object.entries(tally)) {
        totals[id][key] = (totals[id][key] ?? 0) + value;
      }
    }
  }

  return { seeds, wins, stalls, longest, matches, totals };
}

/** The summed counts as the harness's tables, per minute alive. */
function report({ wins, stalls, longest, totals }, seconds) {
  const lines = [
    `${seeds.length} matches in ${seconds.toFixed(0)} s on ${workers} processes; wins: red ${wins.red}, blue ${wins.blue}, undecided ${wins.none}`,
    'class      alive min   K/D  kills/min  deaths/min  life s  damage/min  fatal/min  point %  kits/min  shots/min  hits/shot  cores/min  own  assists'
  ];

  for (const id of CLASSES) {
    const t = totals[id];

    if (!t || !t.alive) {
      continue;
    }

    const minutes = t.alive / 60;
    const cells = [
      (t.alive / 60).toFixed(1).padStart(9),
      (t.kills / Math.max(t.deaths, 1)).toFixed(2).padStart(5),
      (t.kills / minutes).toFixed(2).padStart(9),
      (t.deaths / minutes).toFixed(2).padStart(10),
      (t.life / Math.max(t.lives, 1)).toFixed(0).padStart(6),
      (t.damage / minutes).toFixed(2).padStart(10),
      (t.fatal / minutes).toFixed(2).padStart(9),
      ((t.point / t.alive) * 100).toFixed(0).padStart(7),
      (t.kits / minutes).toFixed(2).padStart(8),
      (t.shots / minutes).toFixed(1).padStart(9),
      (t.hits / Math.max(t.shots, 1)).toFixed(2).padStart(9),
      (t.opened / minutes).toFixed(2).padStart(9),
      String(t.finished).padStart(4),
      String(t.assisted).padStart(8)
    ];
    lines.push(`${id.padEnd(10)} ${cells.join('  ')}`);
  }

  lines.push(`driver stalls ${stalls}, longest ${longest.toFixed(2)} s`);
  return lines.join('\n');
}

/** `count` primes from `first` on. */
function primesFrom(first, count) {
  const primes = [];

  for (let candidate = Math.max(first, 2); primes.length < count; candidate++) {
    if (Array.from({ length: Math.floor(Math.sqrt(candidate)) - 1 }, (_, index) => index + 2).every((divisor) => candidate % divisor !== 0)) {
      primes.push(candidate);
    }
  }

  return primes;
}

/** `--name value` pairs as an object. */
function readOptions(args) {
  const read = {};

  for (let index = 0; index < args.length; index += 2) {
    read[args[index].replace(/^--/, '')] = args[index + 1];
  }

  return read;
}
