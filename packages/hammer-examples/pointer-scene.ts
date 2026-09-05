import { applyPointerSample, stylusReveal, type PointerSample, type VirtualPointer } from './pointer-recording';
import { createStylusScene } from './stylus-scene';

/** Shared drawing surface for live and recorded input, with uniformly fitted playback coordinates. */
export function createPointerScene(canvas: HTMLCanvasElement, stylusCanvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const ink = document.createElement('canvas');
  const inkContext = ink.getContext('2d');
  if (!ctx || !inkContext) throw new Error('Canvas 2D is unavailable');
  const pointers = new Map<number, VirtualPointer>();
  let stylus: ReturnType<typeof createStylusScene> | undefined;
  try {
    stylus = createStylusScene(stylusCanvas);
  } catch {
    /* The 2D pen remains usable without WebGL. */
  }
  let width = 1;
  let height = 1;
  let stageWidth = 1;
  let stageHeight = 1;
  let pixelRatio = 1;
  let latest: PointerSample | undefined;

  return {
    pointers,
    has3D: Boolean(stylus),
    get latest() {
      return latest;
    },
    /** Changing a take clears its ink and pointer state; resize alone preserves them. */
    reset(nextWidth = stageWidth, nextHeight = stageHeight) {
      stageWidth = nextWidth;
      stageHeight = nextHeight;
      ink.width = Math.ceil(stageWidth * pixelRatio);
      ink.height = Math.ceil(stageHeight * pixelRatio);
      inkContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      pointers.clear();
      latest = undefined;
    },
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * pixelRatio);
      canvas.height = Math.ceil(height * pixelRatio);
      stylus?.resize(width, height, pixelRatio);
    },
    toStage(x: number, y: number) {
      const { scale, offsetX, offsetY } = fitStage(width, height, stageWidth, stageHeight);
      return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
    },
    apply(sample: PointerSample) {
      const { previous, pointer } = applyPointerSample(pointers, sample);
      latest = sample;
      if (sample.type !== 'pointerdown' && sample.type !== 'pointermove' && sample.type !== 'pointerup') return;
      if (!pointer.down && !previous?.down) return;
      inkContext.strokeStyle = pointerColor(sample);
      inkContext.fillStyle = pointerColor(sample);
      inkContext.lineCap = 'round';
      inkContext.lineJoin = 'round';
      const pressure = sample.type === 'pointerup' ? (previous?.sample.pressure ?? 0) : sample.pressure;
      inkContext.lineWidth = sample.pointerType === 'pen' ? 1 + 7 * pressure : 2;
      inkContext.beginPath();
      if (previous?.down && sample.type !== 'pointerdown') {
        inkContext.moveTo(previous.sample.x, previous.sample.y);
        inkContext.lineTo(sample.x, sample.y);
        inkContext.stroke();
      } else {
        inkContext.arc(sample.x, sample.y, inkContext.lineWidth / 2, 0, Math.PI * 2);
        inkContext.fill();
      }
    },
    render(time: number, details: boolean) {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const { scale, offsetX, offsetY } = fitStage(width, height, stageWidth, stageHeight);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      ctx.drawImage(ink, 0, 0, stageWidth, stageHeight);
      for (const [id, pointer] of pointers) {
        const { sample, down, inside } = pointer;
        const age = time - pointer.changedAt;
        if ((!inside || sample.pointerType === 'touch') && !down && age > 260) {
          pointers.delete(id);
          continue;
        }
        ctx.save();
        ctx.translate(sample.x, sample.y);
        const color = pointerColor(sample);
        if (sample.pointerType === 'touch') drawFinger(ctx, pointer, time, color);
        else if (sample.pointerType === 'pen') drawPenTip(ctx, pointer, time, Boolean(stylus));
        else drawMouse(ctx, sample.buttons, color);
        if (details && (inside || down)) drawLabel(ctx, pointer, color);
        ctx.restore();
      }
      ctx.restore();
      stylus?.render(pointers, time, scale, offsetX, offsetY);
    },
    dispose() {
      stylus?.dispose();
    }
  };
}

function fitStage(width: number, height: number, stageWidth: number, stageHeight: number) {
  const scale = Math.min(width / stageWidth, height / stageHeight);
  return { scale, offsetX: (width - stageWidth * scale) / 2, offsetY: (height - stageHeight * scale) / 2 };
}

function pointerColor(sample: PointerSample) {
  if (sample.pointerType === 'pen') return '#267d70';
  if (sample.pointerType === 'mouse') return '#444a4a';
  return TOUCH_COLORS[Math.abs(sample.pointerId) % TOUCH_COLORS.length] ?? '#b16d50';
}

function drawMouse(ctx: CanvasRenderingContext2D, buttons: number, color: string) {
  if (buttons) {
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#444a4a16';
    ctx.fill();
    ctx.strokeStyle = '#444a4a50';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(2, 23);
  ctx.lineTo(8, 17);
  ctx.lineTo(14, 28);
  ctx.lineTo(19, 25);
  ctx.lineTo(13, 15);
  ctx.lineTo(22, 14);
  ctx.closePath();
  ctx.shadowColor = '#25333130';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = buttons ? color : '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** A translucent fingertip sits behind the exact contact ellipse reported by the browser. */
function drawFinger(ctx: CanvasRenderingContext2D, pointer: VirtualPointer, time: number, color: string) {
  const { sample, down, changedAt } = pointer;
  ctx.globalAlpha = down ? 1 : Math.max(0, 1 - (time - changedAt) / 220);
  ctx.save();
  ctx.rotate(-0.3);
  const fill = ctx.createLinearGradient(-18, 0, 23, 0);
  fill.addColorStop(0, '#ded5c9d0');
  fill.addColorStop(0.45, '#fff9eed9');
  fill.addColorStop(1, '#c5b8a8a0');
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#9e938650';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-19, -24, 38, 77, [22, 22, 13, 13]);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-12, -18, 24, 28, [12, 12, 7, 7]);
  ctx.fillStyle = '#ffffff65';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(5, sample.width / 2), Math.max(5, sample.height / 2), 0, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 2.5 + sample.pressure * 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPenTip(ctx: CanvasRenderingContext2D, pointer: VirtualPointer, time: number, has3D: boolean) {
  const reveal = stylusReveal(pointer, time);
  if (!has3D && reveal > 0) {
    ctx.save();
    ctx.rotate(Math.atan2(pointer.pose.tiltY, pointer.pose.tiltX) + Math.PI / 2);
    ctx.beginPath();
    ctx.rect(-7, -180 * reveal, 14, 180 * reveal);
    ctx.clip();
    const fill = ctx.createLinearGradient(-6, 0, 6, 0);
    fill.addColorStop(0, '#747e79');
    fill.addColorStop(0.5, '#e5e8df');
    fill.addColorStop(1, '#a3ada6');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(-5, -180, 10, 165, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, -15);
    ctx.lineTo(0, 0);
    ctx.lineTo(5, -15);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 5 + pointer.sample.pressure * 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#267d7055';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = '#267d70';
  ctx.fill();
}

function drawLabel(ctx: CanvasRenderingContext2D, pointer: VirtualPointer, color: string) {
  const sample = pointer.sample;
  const text = `${sample.pointerType || 'pointer'} ${sample.pointerId} · ${pointer.down ? 'down' : 'hover'} · p ${sample.pressure.toFixed(2)}`;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#fffffff0';
  ctx.beginPath();
  ctx.roundRect(24, -21, ctx.measureText(text).width + 16, 24, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, 32, -5);
}

const TOUCH_COLORS = ['#b16d50', '#647eaa', '#a66b88', '#8a853e', '#6b8c75'];
