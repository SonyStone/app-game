import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

/*
 * Prints an input recording from the editor's recorder (src/features/recording) as a readable timeline:
 *
 *   node scripts/recording-timeline.mjs recordings/<id> [--from 2.5] [--to 4] [--events]
 *
 * Contacts, captures, keys, commands and state changes get a line each. Moves and raw updates of a pointer between
 * those lines are merged into one line with the distance, the event and coalesced sample counts and the pressure
 * range; `samples` commands are merged the same way. --from and --to limit the timeline to seconds since the start.
 * --events prints the recorded events in that range as JSON lines instead, with every measurement.
 */
/** Moves of one pointer are split into lines of at most this many milliseconds. */
const maxRunMs = 1000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { from: { type: 'string' }, to: { type: 'string' }, events: { type: 'boolean' } }
});

if (positionals.length !== 1) {
  console.error('Usage: node scripts/recording-timeline.mjs recordings/<id> [--from S] [--to S] [--events]');
  process.exit(1);
}

const file = (await stat(positionals[0])).isDirectory() ? path.join(positionals[0], 'recording.json') : positionals[0];
const recording = JSON.parse(await readFile(file, 'utf8'));

if (recording.version !== 1) {
  console.error(`Unsupported recording version ${recording.version}.`);
  process.exit(1);
}

const from = values.from === undefined ? -Infinity : Number(values.from) * 1000;
const to = values.to === undefined ? Infinity : Number(values.to) * 1000;
const events = recording.events.filter((event) => event.time >= from && event.time <= to);

if (values.events) {
  for (const event of events) {
    console.log(JSON.stringify(event));
  }

  process.exit(0);
}

printHeader(recording, path.dirname(file));
printTimeline(events, recording.initial);

/** Prints the note, environment, starting state and saved files. */
function printHeader(recording, directory) {
  const { environment } = recording;
  console.log(`Recording ${recording.id}, ${recording.startedAt}, ${seconds(recording.duration)} s`);
  console.log(`Note: ${recording.note || '(none)'}`);
  console.log(
    `Viewport ${environment.viewport.width}×${environment.viewport.height} @${environment.devicePixelRatio}x, ` +
      `${environment.maxTouchPoints} touch points, raw pointer updates ${environment.rawPointerUpdates ? 'yes' : 'no'}`
  );
  console.log(`Browser: ${environment.userAgent}`);

  if (recording.build) {
    const { revision, localChanges } = recording.build;
    console.log(`Build: ${revision?.slice(0, 10) ?? 'unknown'}${localChanges ? ' with local changes' : ''}`);
  }

  for (const [kind, name] of Object.entries(recording.files)) {
    console.log(`File ${kind}: ${path.join(directory, name)}`);
  }

  console.log(`Initial state: ${JSON.stringify(recording.initial)}`);
  console.log(`${recording.events.length} events\n`);
}

/**
 * Prints one line per discrete event. Between them, the moves of each pointer, consecutive sample batches and
 * repeated changes of the same state keys, such as the camera during a pan, are merged into one line each.
 */
function printTimeline(events, initial) {
  /** Open move runs by pointer id. */
  const moves = new Map();
  /** Open state runs by their changed keys. */
  const changes = new Map();
  let batches;
  const state = structuredClone(initial);

  for (const event of events) {
    if (event.kind === 'pointer' && (event.type === 'pointermove' || event.type === 'pointerrawupdate')) {
      const run = moves.get(event.pointerId);
      if (run && event.time - run.start > maxRunMs) {
        const text = describeMove(run);
        if (text) {
          line(run.start, text);
        }

        moves.delete(event.pointerId);
      }

      addMove(moves, event);
      continue;
    }

    if (event.kind === 'command' && event.command?.type === 'samples') {
      batches ??= { start: event.time, end: event.time, count: 0, samples: 0 };
      batches.end = event.time;
      batches.count++;
      batches.samples += count(event.command.samples);
      continue;
    }

    if (event.kind === 'state') {
      const keys = Object.keys(event.changes).sort().join(',');
      const run = changes.get(keys) ?? { start: event.time, count: 0, before: {}, after: {} };
      changes.set(keys, run);
      run.end = event.time;
      run.count++;

      for (const [key, value] of Object.entries(event.changes)) {
        if (!(key in run.before)) {
          run.before[key] = state[key];
        }

        run.after[key] = value;
        state[key] = value;
      }

      continue;
    }

    flush();
    print(event);
  }

  flush();

  /** Prints the open runs in the order they started. */
  function flush() {
    const lines = [...moves.values()].map((run) => ({ start: run.start, text: describeMove(run) }));

    for (const run of changes.values()) {
      const described = Object.keys(run.after).map((key) => describeChange(key, run.before[key], run.after[key]));
      lines.push({ start: run.start, text: `state ${described.join(', ')}${repeated(run)}` });
    }

    if (batches) {
      lines.push({ start: batches.start, text: `cmd samples (${batches.samples} samples)${repeated(batches)}` });
    }

    for (const { start, text } of lines.sort((a, b) => a.start - b.start)) {
      if (text) {
        line(start, text);
      }
    }

    moves.clear();
    changes.clear();
    batches = undefined;
  }

  function print(event) {
    switch (event.kind) {
      case 'pointer':
        line(
          event.time,
          `${pointer(event)} ${event.type.replace(/^pointer/, '')} ${point(event)} ${pen(event)}` +
            `buttons=${event.buttons}${modifiers(event)}${event.target ? ` → ${event.target}` : ''}`
        );
        break;
      case 'key':
        line(
          event.time,
          `key ${event.type === 'keydown' ? 'down' : 'up'} ${JSON.stringify(event.key)} (${event.code})` +
            `${modifiers(event)}${event.repeat ? ' repeat' : ''} → ${event.target}`
        );
        break;
      case 'wheel':
        line(
          event.time,
          `wheel ${point(event)} Δ${round(event.deltaX)},${round(event.deltaY)} mode=${event.deltaMode}` +
            `${modifiers(event)} → ${event.target}`
        );
        break;
      case 'command':
        line(event.time, `cmd ${truncate(JSON.stringify(event.command), 220)}`);
        break;
      case 'viewport':
        line(event.time, `viewport ${event.width}×${event.height} @${event.devicePixelRatio}x`);
        break;
      case 'visibility':
        line(event.time, `page ${event.state}`);
        break;
      case 'focus':
        line(event.time, `window ${event.type}`);
        break;
      default:
        line(event.time, truncate(JSON.stringify(event), 220));
    }
  }
}

/** Starts or extends the move run of the event's pointer. */
function addMove(moves, event) {
  const samples = event.coalesced ?? [event];
  let run = moves.get(event.pointerId);

  if (!run) {
    run = {
      start: event.time,
      label: pointer(event),
      first: samples[0],
      last: samples[0],
      moves: 0,
      raw: 0,
      samples: 0,
      distance: 0,
      pressure: [Infinity, -Infinity],
      buttons: new Set()
    };
    moves.set(event.pointerId, run);
  }

  if (event.type === 'pointerrawupdate') {
    // Raw updates repeat the samples of the following moves; count them without measuring them twice.
    run.raw++;
    return;
  }

  run.moves++;
  run.end = event.time;

  for (const sample of samples) {
    run.distance += Math.hypot(sample.clientX - run.last.clientX, sample.clientY - run.last.clientY);
    run.last = sample;
    run.samples++;
    run.buttons.add(sample.buttons);
    run.pressure[0] = Math.min(run.pressure[0], sample.pressure);
    run.pressure[1] = Math.max(run.pressure[1], sample.pressure);
  }
}

/** Describes a move run; nothing for raw updates alone, which precede a move or a contact with its own line. */
function describeMove(run) {
  if (run.moves === 0) {
    return undefined;
  }

  const action = [...run.buttons].some((buttons) => buttons !== 0) ? 'drag' : 'hover';
  const pressure =
    run.pressure[0] === Infinity
      ? ''
      : ` p=${run.pressure[0].toFixed(2)}${run.pressure[1] > run.pressure[0] ? `–${run.pressure[1].toFixed(2)}` : ''}`;
  return (
    `${run.label} ${action} ${point(run.first)} → ${point(run.last)} ${round(run.distance)}px` +
    ` over ${round((run.end ?? run.start) - run.start)}ms, ${run.moves} moves/${run.samples} samples` +
    `${run.raw ? `, ${run.raw} raw` : ''}${pressure} buttons=${[...run.buttons].join('|')}`
  );
}

/** How often and until when a merged run repeated, if more than once. */
function repeated(run) {
  return run.count > 1 ? ` ×${run.count} until ${seconds(run.end)}s` : '';
}

/** Describes a changed state key; object values report only their changed properties. */
function describeChange(key, before, after) {
  if (isObject(before) && isObject(after)) {
    const changed = Object.keys({ ...before, ...after }).filter(
      (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name])
    );
    return changed.map((name) => `${key}.${name}: ${short(before[name])} → ${short(after[name])}`).join(', ');
  }

  return `${key}: ${short(before)} → ${short(after)}`;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function short(value) {
  return value === undefined
    ? '∅'
    : truncate(
        JSON.stringify(value, (_, item) => (typeof item === 'number' ? round(item, 3) : item)),
        80
      );
}

function line(time, text) {
  console.log(`${seconds(time).padStart(9)}s  ${text}`);
}

function pointer(event) {
  return `${event.pointerType}#${event.pointerId}${event.isPrimary ? '' : '′'}`;
}

function point(event) {
  return `(${Math.round(event.clientX)},${Math.round(event.clientY)})`;
}

/** Pressure, tilt and contact size, where the device reports them. */
function pen(event) {
  const parts = [`p=${event.pressure.toFixed(2)}`];

  if (event.tiltX || event.tiltY) {
    parts.push(`tilt=${event.tiltX},${event.tiltY}`);
  }

  if (event.pointerType === 'touch') {
    parts.push(`size=${round(event.width)}×${round(event.height)}`);
  }

  return `${parts.join(' ')} `;
}

function modifiers(event) {
  const pressed = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']
    .filter((key) => event[key])
    .map((key) => key.slice(0, -3));
  return pressed.length ? ` +${pressed.join('+')}` : '';
}

/** Sample count of an abbreviated sample array. */
function count(samples) {
  return Array.isArray(samples) ? samples.length : (samples?.length ?? 0);
}

function seconds(ms) {
  return (ms / 1000).toFixed(3);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
