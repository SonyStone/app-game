import { describe, expect, it } from 'vitest';
import { BUBBLE_TIME, createRadio, MARKER_TIME, URGENT } from './radio';
import type { Member } from './team';

describe('team radio', () => {
  it('shows a line for a while, longer when it puts a marker on the map', () => {
    const { radio, advance } = setup();
    radio.say(bot(1), 'go');
    radio.say(bot(2), 'kit', { marker: { kind: 'kit', x: 10, y: 20 } });

    advance(BUBBLE_TIME + 0.1);
    expect(radio.callouts.map((callout) => callout.line)).toEqual(['kit']);

    advance(MARKER_TIME);
    expect(radio.callouts).toEqual([]);
  });

  it('does not let a bot repeat itself or the team echo a line just said', () => {
    const { radio, advance } = setup();

    expect(radio.say(bot(1), 'go')).toBe(true);
    advance(BUBBLE_TIME + 0.1);
    expect(radio.say(bot(1), 'go')).toBe(false);
    expect(radio.say(bot(2), 'go')).toBe(false);
    expect(radio.say(bot(2), 'needHelp', { priority: URGENT })).toBe(true);
    expect(radio.say(bot(3), 'needHelp', { priority: URGENT })).toBe(true);
  });

  it('counts a countdown down as new lines', () => {
    const { radio, advance } = setup();

    expect(radio.say(bot(1), 'countdown', { seconds: 2 })).toBe(true);
    advance(1);
    expect(radio.say(bot(1), 'countdown', { seconds: 1 })).toBe(true);
    expect(radio.callouts.map((callout) => callout.seconds)).toEqual([1]);
  });

  it('keeps an urgent line over a lesser one, and lets the lesser one wait its turn', () => {
    const { radio, advance } = setup();
    radio.say(bot(1), 'needHelp', { priority: URGENT });

    expect(radio.say(bot(1), 'capturing')).toBe(false);
    advance(BUBBLE_TIME + 0.1);
    expect(radio.say(bot(1), 'capturing')).toBe(true);
  });

  it('never speaks for a human', () => {
    const { radio } = setup();

    expect(radio.say({ ...bot(1), human: true }, 'go')).toBe(false);
  });
});

function setup() {
  let time = 0;
  const radio = createRadio(() => time);
  return {
    radio,
    advance(seconds: number) {
      time += seconds;
    }
  };
}

const seats = new Map<number, Member>();

/** The same bot seat for the same `id`. */
function bot(id: number) {
  let member = seats.get(id);

  if (!member) {
    member = { id, human: false } as Member;
    seats.set(id, member);
  }

  return member;
}
