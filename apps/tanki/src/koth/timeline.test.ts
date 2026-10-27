import { describe, expect, it } from 'vitest';
import type { Chronicle, ChronicleThought } from './chronicle';
import { timelineOf } from './timeline';

describe('a recorded match on its timeline', () => {
  const thought = (step: number, action: string, target?: number): ChronicleThought => ({ step, member: 1, goal: 'kill', action, plan: [action], at: 0, target });
  const chronicle: Chronicle = {
    members: [
      { id: 0, team: 'red', seat: 0, name: 'You', human: true },
      { id: 1, team: 'blue', seat: 0, name: 'Blue 1', human: false }
    ],
    every: 15,
    samples: [],
    spawns: [
      { step: 0, member: 0, tankClass: 'soldier' },
      { step: 0, member: 1, tankClass: 'soldier' },
      { step: 700, member: 1, tankClass: 'sniper' },
      // A class changed in the base: a new tank without a death.
      { step: 1000, member: 0, tankClass: 'scout' }
    ],
    kills: [{ step: 500, victim: 1, victimClass: 'soldier', killer: 0, killerClass: 'soldier', x: 0, y: 0 }],
    thoughts: [thought(0, 'goToPoint'), thought(100, 'goToPoint'), thought(200, 'attackFront', 0), thought(300, 'attackFront', 0), thought(720, 'goToPoint')],
    radio: [{ step: 210, member: 1, line: 'enemy', tankClass: 'soldier' }],
    capture: [{ step: 0 }, { step: 800, owner: 'blue' }]
  };
  const timeline = timelineOf(chronicle, 1200);
  const [you, blue] = timeline.tracks;

  it('lays out every life, to a death or to the next tank', () => {
    expect(you.lives).toEqual([
      { from: 0, to: 1000, tankClass: 'soldier' },
      { from: 1000, to: 1200, tankClass: 'scout' }
    ]);
    expect(blue.lives).toEqual([
      { from: 0, to: 500, tankClass: 'soldier' },
      { from: 700, to: 1200, tankClass: 'sniper' }
    ]);
  });

  it('joins thoughts of one action into a segment, cut at the death', () => {
    expect(blue.segments.map(({ from, to, kind, action }) => ({ from, to, kind, action }))).toEqual([
      { from: 0, to: 200, kind: 'move', action: 'goToPoint' },
      { from: 200, to: 500, kind: 'attack', action: 'attackFront' },
      { from: 720, to: 1200, kind: 'move', action: 'goToPoint' }
    ]);
    expect(you.segments).toEqual([]);
  });

  it('marks kills, deaths, radio lines, new targets and new classes on their members', () => {
    expect(you.markers.map((marker) => [marker.step, marker.kind])).toEqual([
      [500, 'kill'],
      [1000, 'class']
    ]);
    expect(blue.markers.map((marker) => [marker.step, marker.kind])).toEqual([
      [200, 'target'],
      [210, 'radio'],
      [500, 'death'],
      [700, 'class']
    ]);
  });

  it('shows who held the point when', () => {
    expect(timeline.capture).toEqual([
      { from: 0, to: 800, owner: undefined },
      { from: 800, to: 1200, owner: 'blue' }
    ]);
  });
});
