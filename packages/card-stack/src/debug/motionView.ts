import type { createCardStackRecording } from './createCardStackRecording';

/** Recorded samples, shared by the inspector and its export. No live DOM references. */
export type StackCapture = NonNullable<ReturnType<ReturnType<typeof createCardStackRecording>['capture']>>;
export type StackFrame = StackCapture['frames'][number];
export type MotionPoint = { frame: number; t: number; element: StackFrame['data']['elements'][number] };

/** Preserves DOM instance identity, including separate echo lifetimes and missing samples. */
export function collectMotionTracks(frames: readonly StackFrame[]) {
  const lifetimes = new Map<string, number>();
  const tracks = new Map<number, { key: string; instance: number; label: string; part: string; representation: string; travel: number; points: MotionPoint[] }>();
  frames.forEach((frame, index) => {
    for (const element of frame.data.elements) {
      let track = tracks.get(element.instance);
      if (!track) {
        const identity = JSON.stringify([element.itemId, element.part, element.representation]);
        const lifetime = lifetimes.get(identity) ?? 0;
        lifetimes.set(identity, lifetime + 1);
        track = {
          key: JSON.stringify([element.itemId, element.part, element.representation, lifetime]),
          instance: element.instance,
          label: `${element.itemId} / ${element.part}${element.representation === 'echo' ? ` / echo #${element.instance}` : ''}`,
          part: element.part, representation: element.representation, travel: 0, points: []
        };
        tracks.set(element.instance, track);
      }
      const previous = track.points.at(-1);
      if (previous && previous.frame === index - 1)
        track.travel += Math.hypot(element.x - previous.element.x, element.y - previous.element.y);
      track.points.push({ frame: index, t: frame.t, element });
    }
  });
  return [...tracks.values()];
}

/** Selects a time window around the cursor; zero means the complete recording. */
export function windowMotionPoints<T extends { t: number }>(points: readonly T[], time: number, windowMs: number) {
  if (!windowMs || !points.length) return [...points];
  const first = points[0]!.t;
  const last = points.at(-1)!.t;
  const start = Math.max(first, Math.min(time - windowMs / 2, last - windowMs));
  return points.filter((point) => point.t >= start && point.t <= start + windowMs);
}

/** Breaks paths across absence/hidden poses instead of inventing movement between them. */
export function motionSegments(points: readonly MotionPoint[], includeHidden: boolean) {
  const segments: MotionPoint[][] = [];
  let previous: MotionPoint | undefined;
  for (const point of points) {
    if (!includeHidden && !visibleMotionPose(point)) { previous = undefined; continue; }
    if (!previous || point.frame !== previous.frame + 1) segments.push([]);
    segments.at(-1)!.push(point);
    previous = point;
  }
  return segments;
}

/** Evenly samples distinct poses, avoiding a pile of identical outlines while settled. */
export function onionPoses(points: readonly MotionPoint[], count: number, includeHidden: boolean) {
  const unique = new Map<string, MotionPoint>();
  for (const point of points) {
    if (!includeHidden && !visibleMotionPose(point)) continue;
    const e = point.element;
    const key = [e.x, e.y, e.width, e.height].map((v) => v.toFixed(2)).join(',');
    if (!unique.has(key)) unique.set(key, point);
  }
  const poses = [...unique.values()];
  if (poses.length <= count) return poses;
  return Array.from({ length: count }, (_, i) => poses[Math.round(i * (poses.length - 1) / (count - 1))]!);
}

/** Finds the nearest actual sample; the inspector never interpolates a synthetic frame. */
export function nearestMotionFrame(frames: readonly StackFrame[], time: number) {
  let nearest = 0;
  frames.forEach((frame, i) => { if (Math.abs(frame.t - time) < Math.abs(frames[nearest]!.t - time)) nearest = i; });
  return nearest;
}

/** Initial cursor highlights the largest observed step in the selected track. */
export function largestMotionStep(points: readonly MotionPoint[]) {
  let frame = points[0]?.frame ?? 0;
  let largest = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (b.frame !== a.frame + 1) continue;
    const distance = Math.hypot(b.element.x - a.element.x, b.element.y - a.element.y);
    if (distance > largest) { largest = distance; frame = b.frame; }
  }
  return frame;
}

/** Fits the complete track and deck in a stable scene; scrubbing does not change its scale. */
export function motionProjection(frames: readonly StackFrame[], points: readonly MotionPoint[], width: number, height: number, fitMotion = false, pointers: readonly { rootX: number; rootY: number }[] = []) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const include = (x: number, y: number) => {
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  };
  if (!fitMotion || !points.length) {
    include(0, 0);
    frames.forEach(frame => include(frame.data.root.width, frame.data.root.height));
  }
  points.forEach(({ element: e }) => { include(e.x, e.y); include(e.x + e.width, e.y + e.height); });
  pointers.forEach(pointer => include(pointer.rootX, pointer.rootY));
  const worldWidth = Math.max(1, right - left), worldHeight = Math.max(1, bottom - top);
  const scale = Math.min((width - 48) / worldWidth, (height - 40) / worldHeight);
  return {
    scale,
    x: (x: number) => (width - worldWidth * scale) / 2 + (x - left) * scale,
    y: (y: number) => (height - worldHeight * scale) / 2 + (y - top) * scale
  };
}

/** Visibility recorded for this element; does not infer clipping or occlusion. */
export function visibleMotionPose({ element }: MotionPoint) {
  return element.visibility !== 'hidden' && element.visibility !== 'collapse' && Number(element.opacity) > 0 && element.width > 0 && element.height > 0;
}

/** Pointer events keep their own timestamps; no movement is invented between gestures. */
export function pointerSegments(events: readonly StackCapture['events'][number][]) {
  const segments = new Map<number, { t: number; data: StackCapture['events'][number]['data']; pointer: NonNullable<StackCapture['events'][number]['data']['pointer']> }[]>();
  for (const event of events) {
    const pointer = event.data.pointer;
    if (!pointer) continue;
    if (!segments.has(pointer.gesture)) segments.set(pointer.gesture, []);
    segments.get(pointer.gesture)!.push({ ...event, pointer });
  }
  return [...segments.values()];
}

/** One measured DOM lifetime; keys survive new recordings with new DOM instance IDs. */
export type MotionTrack = ReturnType<typeof collectMotionTracks>[number];

/** Back-to-front order within the deck: parent stacking context, DOM order, then local z-index. */
export function motionPaintOrder(elements: readonly StackFrame['data']['elements'][number][]) {
  return [...elements].sort((a, b) => a.paint.cardZ - b.paint.cardZ || a.paint.domOrder - b.paint.domOrder || a.paint.localZ - b.paint.localZ || Number(a.part === 'tab') - Number(b.part === 'tab'));
}

/** Stable opaque diagnostic colors shared by a card and its tab. */
export function motionSurfaceColor(itemId: string) {
  let hash = 0;
  for (const character of itemId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 22% 32%)`;
}
