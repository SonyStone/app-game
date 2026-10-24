import { describe, expect, it } from 'vitest';
import { detachLoosePieces, sampleField, solidBoxes } from './field';
import { cutRail, RAIL_DASH, traceRail } from './rail';
import { createHullField, MEDIUM_HULL } from './shapes';

const core = MEDIUM_HULL.core;
const across = { x: 0, y: 1 };
const SLIT = { slit: 1.4, hole: 2.4, seed: 7 };

describe('a rail through a hull', () => {
  it('crosses the core from any side when its line passes through it, with power to reach it', () => {
    const field = createHullField();
    // Side on through the core, from the rear and from the front along the hull.
    const side = traceRail(field, { x: core.x, y: -40 }, across, { power: 40, graze: 0.7 })!;
    const rear = traceRail(field, { x: -40, y: core.y }, { x: 1, y: 0 }, { power: 40, graze: 0.7 })!;
    const front = traceRail(field, { x: 40, y: core.y + 2 }, { x: -1, y: 0 }, { power: 40, graze: 0.7 })!;

    expect(side.core).toBeDefined();
    expect(rear.core).toBeDefined();
    expect(front.core).toBeDefined();
    // The rear armor is the thinnest: a weak rail reaches the core there and nowhere else.
    expect(traceRail(field, { x: -40, y: core.y }, { x: 1, y: 0 }, { power: 6, graze: 0.7 })!.core).toBeDefined();
    expect(traceRail(field, { x: 40, y: core.y }, { x: -1, y: 0 }, { power: 6, graze: 0.7 })!.core).toBeUndefined();
  });

  it('leaves a slit beside the core that goes through the hull, which stays one piece and keeps its core hidden', () => {
    const field = createHullField();
    const area = solidBoxes(field, 1).area;
    const origin = { x: core.x + core.radius + 4, y: -40 };
    const trace = traceRail(field, origin, across, { power: 40, graze: 0.7 })!;

    expect(trace.core).toBeUndefined();
    expect(trace.through).toBe(true);
    // The whole width of the hull.
    expect(trace.armor).toBeCloseTo(MEDIUM_HULL.halfWidth * 2, 0);

    cutRail(field, origin, across, trace, SLIT);
    const pieces = detachLoosePieces(field, 6);
    const left = solidBoxes(field, 1).area;

    // A few petals and crumbs at most come off the exit; the hull holds together across the slit.
    expect(pieces.reduce((total, piece) => total + piece.cells, 0) * field.cell * field.cell).toBeLessThan(25);
    expect(left).toBeGreaterThan(area * 0.92);
    expect(left).toBeLessThan(area * 0.98);
    // The slit is open along the line, between bridges, and the core still lies under armor.
    const open = [...Array(20).keys()].map((index) => sampleField(field, origin.x, -10 + index)[0] >= 0).filter(Boolean).length;
    expect(open).toBeGreaterThan(20 * (RAIL_DASH / (RAIL_DASH + 2.8)) * 0.8);
    expect(sampleField(field, core.x, core.y)[2]).toBeLessThan(0);
    expect(traceRail(field, { x: core.x, y: -40 }, across, { power: 6, graze: 0.7 })?.core).toBeUndefined();
  });

  it('stops inside armor thicker than its power and spends wood at its cost', () => {
    const field = createHullField();
    const lengthwise = traceRail(field, { x: 40, y: 8 }, { x: -1, y: 0 }, { power: 15 })!;

    expect(lengthwise.through).toBe(false);
    expect(lengthwise.armor).toBeLessThanOrEqual(15);
    expect(lengthwise.end - lengthwise.entry).toBeCloseTo(15, 0);
    // At half the cost a pixel, the same power goes twice as far.
    expect(traceRail(field, { x: 40, y: 8 }, { x: -1, y: 0 }, { power: 15, cost: 0.5 })!.end - lengthwise.entry).toBeCloseTo(30, 0);
  });

  it('goes through holes for free and misses a hull it passes by', () => {
    const field = createHullField();
    const origin = { x: 5, y: -40 };
    const first = traceRail(field, origin, across, { power: 40 })!;
    cutRail(field, origin, across, first, SLIT);
    // Along the same line again only the bridges are left in the way.
    const second = traceRail(field, origin, across, { power: 40 })!;

    expect(second.armor).toBeLessThan(first.armor * 0.45);
    expect(traceRail(field, { x: 5, y: -40 }, { x: 1, y: 0 }, { power: 40 })).toBeUndefined();
  });
});
