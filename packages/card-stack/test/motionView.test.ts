import { describe, expect, it } from 'vitest';
import { collectMotionTracks, largestMotionStep, motionProjection, motionPaintOrder, motionSegments, nearestMotionFrame, onionPoses, windowMotionPoints, type StackFrame } from '../src/debug/motionView';

describe('recorded motion views', () => {
  it('keeps echoes separate and does not connect disappearance or hidden intervals', () => {
    const frames = [sample(0, 0), sample(20, 10), sample(40, 20), sample(60, 30), sample(80, 40)];
    frames[1]!.data.elements.push({ ...frames[1]!.data.elements[0]!, instance: 2, representation: 'echo' });
    frames[2]!.data.elements = [];
    frames[3]!.data.elements[0]!.visibility = 'hidden';
    const tracks = collectMotionTracks(frames);
    expect(tracks.map((track) => track.instance)).toEqual([1, 2]);
    expect(tracks[1]!.label).toContain('echo #2');
    expect(motionSegments(tracks[0]!.points, false).map((segment) => segment.map((p) => p.frame))).toEqual([[0, 1], [4]]);
    expect(motionSegments(tracks[0]!.points, true).map((segment) => segment.map((p) => p.frame))).toEqual([[0, 1], [3, 4]]);
  });

  it('uses stable selection keys across recordings while keeping simultaneous lifetimes separate', () => {
    const first = [sample(0, 0)];
    const second = [sample(0, 0)];
    second[0]!.data.elements[0]!.instance = 80;
    expect(collectMotionTracks(first)[0]!.key).toBe(collectMotionTracks(second)[0]!.key);
    first[0]!.data.elements.push({ ...first[0]!.data.elements[0]!, instance: 2, representation: 'echo' });
    first[0]!.data.elements.push({ ...first[0]!.data.elements[0]!, instance: 3, representation: 'echo' });
    const tracks = collectMotionTracks(first);
    expect(new Set(tracks.map(track => track.key)).size).toBe(3);
  });

  it('uses actual irregular timestamps for seeking and does not invent onion poses', () => {
    const frames = [sample(100, 0), sample(116, 0), sample(150, 20), sample(280, 180), sample(300, 180)];
    const points = collectMotionTracks(frames)[0]!.points;
    expect(nearestMotionFrame(frames, 225)).toBe(3);
    expect(largestMotionStep(points)).toBe(3);
    expect(onionPoses(points, 10, false).map((p) => p.t)).toEqual([100, 150, 280]);
    expect(onionPoses(points, 2, false).map((p) => p.element.x)).toEqual([0, 180]);
    expect(windowMotionPoints(points, 280, 100).map((p) => p.t)).toEqual([280, 300]);
    expect(windowMotionPoints(points, 280, 0)).toHaveLength(5);
  });

  it('paints whole card contexts in z/DOM order before comparing child tab z-index', () => {
    const base = sample(0, 0).data.elements[0]!;
    const element = (instance: number, cardZ: number, domOrder: number, localZ: number) => ({ ...base, instance, paint: { ...base.paint, cardZ, domOrder, localZ } });
    const backTab = element(1, 2, 0, 999);
    const frontBody = { ...element(2, 3, 1, 0), part: 'card' as const };
    const frontTab = element(3, 3, 1, 1);
    const laterCard = { ...element(4, 3, 2, 0), part: 'card' as const };
    const departing = element(5, 62, 0, 1);
    expect(motionPaintOrder([departing, frontTab, laterCard, frontBody, backTab]).map(element => element.instance)).toEqual([1, 2, 3, 4, 5]);
    expect(motionPaintOrder([{ ...backTab, paint: { ...backTab.paint, cardZ: 70 } }, departing]).map(element => element.instance)).toEqual([5, 1]);
  });

  it('fits negative and off-deck positions without changing scale at the selected sample', () => {
    const frames = [sample(0, -120), sample(20, 800)];
    const points = collectMotionTracks(frames)[0]!.points;
    const view = motionProjection(frames, points, 500, 300);
    expect(view.x(-120)).toBeGreaterThanOrEqual(24);
    expect(view.x(900)).toBeLessThanOrEqual(476);
    expect(view.y(0)).toBeGreaterThanOrEqual(20);
    expect(view.y(600)).toBeLessThanOrEqual(280);
    const pointerView = motionProjection(frames, points, 500, 300, true, [{ rootX: -400, rootY: 900 }]);
    expect(pointerView.x(-400)).toBeGreaterThanOrEqual(24);
    expect(pointerView.y(900)).toBeLessThanOrEqual(280);
    expect(view.x(100) - view.x(0)).toBeCloseTo(100 * view.scale);
  });
});

function sample(t: number, x: number): StackFrame {
  return {
    t, source: 'raf', data: {
      root: { x: 0, y: 0, width: 400, height: 600 },
      viewport: { width: 1200, height: 900, scrollX: 0, scrollY: 0 }, pointer: null,
      state: { phase: 'idle', layout: 'stacked', dragging: false, direct: false, selectionTarget: null, tabOrder: ['notes'], railOffset: 0, stackPan: 0 },
      elements: [{
        instance: 1, itemId: 'notes', representation: 'live', part: 'tab', x, y: 20, width: 100, height: 40,
        transform: 'none', opacity: '1', visibility: 'visible', zIndex: '1', phase: 'idle', active: true,
        paint: { cardZ: 1, domOrder: 0, localZ: 1, opacity: 1, visibility: 'visible', x, y: 20, width: 100, height: 40 },
        motionStyle: { offset: '', paintedOffset: '', dragOffset: '', paintedLeft: '' }
      }]
    }
  };
}
