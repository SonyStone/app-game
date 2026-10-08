/**
 * The gallery's starting artwork, a small still life split into the layers a painter would keep: paper, a pencil
 * sketch, flat colors, multiplied shadows, ink lines and screened highlights. Each layer is painted procedurally with
 * a fixed seed, so replaying a layer for undo redraws exactly the same pixels. Layers without artwork stay empty.
 */
export function paintStillLife(
  context: CanvasRenderingContext2D,
  layer: string,
  sheet: { width: number; height: number }
) {
  const random = seeded(hash(layer));
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  painters[layer]?.(context, random, sheet);
  context.restore();
}

/** An ellipse of the scene: center, radii and turn in degrees. */
type Shape = { x: number; y: number; rx: number; ry: number; turn?: number };

const table = 760;
const vase: Shape = { x: 600, y: 560, rx: 160, ry: 195 };
const neck = { x: 600, top: 300, width: 92, bottom: 400 };
const apple: Shape = { x: 930, y: 680, rx: 96, ry: 90 };
const lemon: Shape = { x: 1170, y: 770, rx: 122, ry: 74, turn: -14 };
const cup: Shape = { x: 300, y: 715, rx: 92, ry: 70 };

const painters: Record<
  string,
  (context: CanvasRenderingContext2D, random: () => number, sheet: { width: number; height: number }) => void
> = {
  paper(context, random, sheet) {
    context.fillStyle = '#efeae1';
    context.fillRect(0, 0, sheet.width, sheet.height);
    // Grain: faint specks, so the paper reads as a surface at high zoom.
    for (let index = 0; index < 2600; index++) {
      context.fillStyle = random() > 0.5 ? 'rgb(120 105 90 / 0.05)' : 'rgb(255 255 255 / 0.25)';
      context.fillRect(random() * sheet.width, random() * sheet.height, 1 + random() * 2, 1 + random() * 2);
    }
  },
  sketch(context, random, sheet) {
    context.strokeStyle = '#41577a';
    context.lineWidth = 2.2;
    for (const shape of [vase, apple, lemon, cup]) {
      for (let pass = 0; pass < 3; pass++) {
        wobblyEllipse(context, random, { ...shape, rx: shape.rx * (1 + (random() - 0.5) * 0.08) }, 0.04);
        context.stroke();
      }

      line(context, random, shape.x - shape.rx * 1.2, shape.y, shape.x + shape.rx * 1.2, shape.y);
      line(context, random, shape.x, shape.y - shape.ry * 1.2, shape.x, shape.y + shape.ry * 1.2);
    }

    line(context, random, 40, table, sheet.width - 40, table + 6);
    line(context, random, neck.x - neck.width / 2, neck.top, neck.x - neck.width / 2 - 10, neck.bottom);
    line(context, random, neck.x + neck.width / 2, neck.top, neck.x + neck.width / 2 + 10, neck.bottom);
  },
  flats(context, random, sheet) {
    context.fillStyle = '#b9c2b4';
    context.fillRect(0, 0, sheet.width, table);
    context.fillStyle = '#a7795a';
    context.fillRect(0, table, sheet.width, sheet.height - table);
    // The wall's brushwork: broad, loose horizontal strokes a little lighter and darker than the wall.
    for (let index = 0; index < 36; index++) {
      context.strokeStyle = random() > 0.5 ? 'rgb(255 255 255 / 0.045)' : 'rgb(40 50 40 / 0.04)';
      context.lineWidth = 30 + random() * 50;
      const y = random() * table;
      line(context, random, random() * sheet.width - 200, y, random() * sheet.width + 200, y + (random() - 0.5) * 40);
    }

    fill(context, random, cup, '#d9d2c3');
    context.fillStyle = '#3d6a8c';
    context.beginPath();
    context.moveTo(neck.x - neck.width / 2, neck.top);
    context.lineTo(neck.x + neck.width / 2, neck.top);
    context.lineTo(neck.x + neck.width / 2 + 14, neck.bottom + 30);
    context.lineTo(neck.x - neck.width / 2 - 14, neck.bottom + 30);
    context.fill();
    fill(context, random, vase, '#3d6a8c');
    fill(context, random, { x: neck.x, y: neck.top, rx: 62, ry: 16 }, '#4b7a9c');
    fill(context, random, apple, '#c4463a');
    fill(context, random, lemon, '#e6b93d');
    context.fillStyle = '#5a3a22';
    context.fillRect(apple.x - 4, apple.y - apple.ry - 28, 8, 34);
  },
  shade(context, random) {
    const shadow = '#6f6688';
    for (const shape of [cup, vase, apple, lemon]) {
      const floor = shape === vase ? vase.y + vase.ry : shape.y + shape.ry * 0.8;
      fill(
        context,
        random,
        { x: shape.x + shape.rx * 0.55, y: floor, rx: shape.rx * 1.15, ry: shape.ry * 0.28 },
        shadow
      );
      // Form shadow: the object's own shape, minus the lit part toward the top left.
      context.save();
      wobblyEllipse(context, random, shape, 0.01);
      context.clip();
      context.fillStyle = shadow;
      context.beginPath();
      context.ellipse(
        shape.x + shape.rx * 0.55,
        shape.y + shape.ry * 0.35,
        shape.rx * 1.05,
        shape.ry * 1.05,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
    }
  },
  ink(context, random, sheet) {
    context.strokeStyle = '#262329';
    for (const shape of [cup, vase, apple, lemon]) {
      context.lineWidth = 3.2;
      wobblyEllipse(context, random, shape, 0.015);
      context.stroke();
      context.lineWidth = 1.6;
      wobblyEllipse(context, random, { ...shape, x: shape.x + 2, rx: shape.rx * 0.995 }, 0.02);
      context.stroke();
    }

    context.lineWidth = 3;
    line(context, random, neck.x - neck.width / 2, neck.top, neck.x - neck.width / 2 - 14, neck.bottom + 22);
    line(context, random, neck.x + neck.width / 2, neck.top, neck.x + neck.width / 2 + 14, neck.bottom + 22);
    wobblyEllipse(context, random, { x: neck.x, y: neck.top, rx: 62, ry: 16 }, 0.02);
    context.stroke();
    context.lineWidth = 2.4;
    line(context, random, 0, table, sheet.width, table + 4);
    // Cup handle and apple stem.
    context.beginPath();
    context.ellipse(cup.x - cup.rx - 18, cup.y - 4, 30, 36, 0, Math.PI * 0.5, Math.PI * 1.5);
    context.stroke();
    line(context, random, apple.x, apple.y - apple.ry + 4, apple.x + 6, apple.y - apple.ry - 30);
  },
  light(context, random) {
    context.filter = 'blur(16px)';
    for (const shape of [vase, apple, lemon, cup]) {
      fill(
        context,
        random,
        {
          x: shape.x - shape.rx * 0.38,
          y: shape.y - shape.ry * 0.4,
          rx: shape.rx * 0.22,
          ry: shape.ry * 0.14,
          turn: -30
        },
        '#fff1cf'
      );
    }

    context.filter = 'none';
  }
};

/** Traces an ellipse whose radius wavers by `wobble`, as a hand-drawn line does. */
function wobblyEllipse(context: CanvasRenderingContext2D, random: () => number, shape: Shape, wobble: number) {
  const turn = ((shape.turn ?? 0) * Math.PI) / 180;
  const phase = random() * Math.PI * 2;
  const steps = 72;
  context.beginPath();
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    const waver = 1 + Math.sin(angle * 3 + phase) * wobble + (random() - 0.5) * wobble * 0.6;
    const x = Math.cos(angle) * shape.rx * waver;
    const y = Math.sin(angle) * shape.ry * waver;
    const px = shape.x + x * Math.cos(turn) - y * Math.sin(turn);
    const py = shape.y + x * Math.sin(turn) + y * Math.cos(turn);
    if (step === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  }

  context.closePath();
}

function fill(context: CanvasRenderingContext2D, random: () => number, shape: Shape, color: string) {
  context.fillStyle = color;
  wobblyEllipse(context, random, shape, 0.012);
  context.fill();
}

/** A slightly bowed line, as drawn by hand. */
function line(context: CanvasRenderingContext2D, random: () => number, x1: number, y1: number, x2: number, y2: number) {
  const bow = (random() - 0.5) * 0.04 * Math.hypot(x2 - x1, y2 - y1);
  const mx = (x1 + x2) / 2 - ((y2 - y1) / Math.hypot(x2 - x1, y2 - y1 || 1)) * bow;
  const my = (y1 + y2) / 2 + ((x2 - x1) / Math.hypot(x2 - x1, y2 - y1 || 1)) * bow;
  context.beginPath();
  context.moveTo(x1, y1);
  context.quadraticCurveTo(mx, my, x2, y2);
  context.stroke();
}

/** A small deterministic random generator (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  }

  return value;
}
