import { createRecording, type PointerRecording, type PointerSample } from './pointer-recording';

/** An authored, deterministic take demonstrates pen pressure/tilt, mouse dragging and three simultaneous fingers. */
export function createDemoRecording() {
  const take = createRecording(1000, 640, 0);
  const signature = smoothPath(SIGNATURE);
  const crossbar = smoothPath([
    [255, 285],
    [290, 278],
    [331, 277]
  ]);
  const underline = smoothPath([
    [258, 335],
    [332, 323],
    [450, 327],
    [561, 312],
    [585, 318],
    [540, 335]
  ]);

  hover(take, 'pen', 1, 0, 650, [180, 260], signature(0));
  stroke(take, 'pen', 1, 800, 4100, signature);
  hover(take, 'pen', 1, 4900, 300, signature(1), crossbar(0));
  stroke(take, 'pen', 1, 5300, 450, crossbar);
  hover(take, 'pen', 1, 5750, 300, crossbar(1), underline(0));
  stroke(take, 'pen', 1, 6150, 750, underline);
  hover(take, 'pen', 1, 6900, 450, underline(1), [650, 360]);
  take.append(point('pen', 1, 7400, [650, 360], 'pointerleave'));

  const mousePath = smoothPath([
    [300, 408],
    [340, 380],
    [380, 408],
    [420, 380],
    [460, 408],
    [510, 380],
    [555, 394]
  ]);
  hover(take, 'mouse', 2, 7700, 600, [220, 430], mousePath(0));
  stroke(take, 'mouse', 2, 8450, 2100, mousePath);
  hover(take, 'mouse', 2, 10550, 450, mousePath(1), [595, 420]);
  // A second press makes the distinction between hovering, dragging and clicking visible.
  stroke(take, 'mouse', 2, 11100, 180, () => [595, 420]);
  take.append(point('mouse', 2, 11700, [595, 420], 'pointerleave'));

  for (let finger = 0; finger < 3; finger++) {
    stroke(take, 'touch', 10 + finger, 12300, 3400, (progress) => {
      const angle = -1.7 + (finger * 2 * Math.PI) / 3 + progress * 0.85;
      const radius = 46 + 65 * Math.sin((progress * Math.PI) / 2);
      return [735 + Math.cos(angle) * radius, 345 + Math.sin(angle) * radius];
    });
  }
  return take.finish(18_000);
}

/** Short stage labels follow the playhead, including after a seek. */
export function demoCaption(time: number) {
  if (time < 7700) return 'Стилус · подпись, нажим и наклон';
  if (time < 12000) return 'Мышь · движение, перетаскивание и клик';
  if (time < 16200) return 'Мультитач · три пальца одновременно';
  return 'Попробуйте сами · нажмите «Запись»';
}

/** Generate a complete contact lifecycle at 120 Hz; all devices share the recorder's sample format. */
function stroke(
  take: PointerRecording,
  device: string,
  id: number,
  start: number,
  duration: number,
  path: (progress: number) => Point
) {
  const frames = Math.ceil((duration * 120) / 1000);
  for (let frame = 0; frame <= frames; frame++) {
    const progress = frame / frames;
    const time = start + duration * progress;
    const sample = point(device, id, time, path(progress), frame === 0 ? 'pointerdown' : 'pointermove');
    const tiltX = device === 'pen' ? Math.round(28 + 20 * Math.sin(progress * Math.PI * 2)) : 0;
    const tiltY = device === 'pen' ? Math.round(-30 + 15 * Math.cos(progress * Math.PI * 3)) : 0;
    const x = Math.tan((tiltX * Math.PI) / 180);
    const y = Math.tan((tiltY * Math.PI) / 180);
    take.append({
      ...sample,
      buttons: 1,
      button: frame === 0 ? 0 : -1,
      pressure:
        device === 'pen' ? 0.18 + 0.62 * Math.pow(Math.sin(Math.PI * progress), 2) : device === 'mouse' ? 0.5 : 0.65,
      tiltX,
      tiltY,
      twist: device === 'pen' ? Math.round(20 + 45 * progress) : 0,
      altitudeAngle: Math.atan2(1, Math.hypot(x, y)),
      azimuthAngle: (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)
    });
  }
  take.append(point(device, id, start + duration, path(1), 'pointerup'));
}

/** Hover has zero pressure and no body orientation, exercising the pen-tip-only state. */
function hover(
  take: PointerRecording,
  device: string,
  id: number,
  start: number,
  duration: number,
  from: Point,
  to: Point
) {
  const frames = Math.ceil((duration * 60) / 1000);
  for (let frame = 0; frame <= frames; frame++) {
    const progress = frame / frames;
    const eased = progress * progress * (3 - 2 * progress);
    take.append(
      point(
        device,
        id,
        start + duration * progress,
        [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased],
        'pointermove'
      )
    );
  }
}

function point(device: string, id: number, time: number, position: Point, type: string): PointerSample {
  return {
    type,
    time,
    timeStamp: time,
    x: position[0],
    y: position[1],
    pointerId: id,
    pointerType: device,
    isPrimary: device !== 'touch' || id === 10,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: Math.PI / 2,
    azimuthAngle: 0,
    width: device === 'touch' ? 24 : 1,
    height: device === 'touch' ? 30 : 1,
    button: type === 'pointerup' ? 0 : -1,
    buttons: 0
  };
}

/** Interpolate handwritten control points with a Catmull–Rom spline, retaining natural speed variation. */
function smoothPath(points: readonly Point[]) {
  return (progress: number): Point => {
    const position = Math.min(1, Math.max(0, progress)) * (points.length - 1);
    const index = Math.min(points.length - 2, Math.floor(position));
    const a = points[Math.max(0, index - 1)] ?? [0, 0];
    const b = points[index] ?? a;
    const c = points[index + 1] ?? b;
    const d = points[Math.min(points.length - 1, index + 2)] ?? c;
    const t = position - index;
    const coordinate = (axis: 0 | 1) =>
      0.5 *
      (2 * b[axis] +
        (-a[axis] + c[axis]) * t +
        (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t * t +
        (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t * t * t);
    return [coordinate(0), coordinate(1)];
  };
}

/** A point in the demo's fixed 1000 × 640 stage. */
type Point = readonly [x: number, y: number];

const SIGNATURE: readonly Point[] = [
  [250, 310],
  [282, 255],
  [322, 206],
  [331, 218],
  [312, 270],
  [297, 307],
  [333, 286],
  [361, 260],
  [397, 208],
  [409, 204],
  [407, 230],
  [377, 275],
  [370, 297],
  [390, 307],
  [414, 295],
  [445, 274],
  [435, 265],
  [417, 281],
  [425, 303],
  [446, 304],
  [468, 286],
  [479, 269],
  [482, 284],
  [487, 300],
  [502, 297],
  [523, 276],
  [540, 275],
  [538, 290],
  [527, 306],
  [558, 304]
];
