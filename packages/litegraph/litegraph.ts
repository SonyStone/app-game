import gridImg from './grid.png?url';

// timer that works everywhere
const getTime = (() => {
  if (typeof performance != 'undefined') {
    return performance.now.bind(performance);
  } else if (typeof Date != 'undefined' && Date.now) {
    return Date.now.bind(Date);
  } else if (typeof process != 'undefined') {
    return function () {
      var t = process.hrtime();
      return t[0] * 0.001 + t[1] * 1e-6;
    };
  } else {
    return function getTime() {
      return new Date().getTime();
    };
  }
})();

export class LGraph {
  globaltime: number = 0;
  iteration: number = 0;
  _nodes: any[] = [];
  _version: number = 0;
  constructor() {}
}

const title_text_font = '14px Arial';
const inner_text_font = 'normal 12px Arial';
const default_link_color = '#9A9';
const default_connection_color = {
  input_off: '#778',
  input_on: '#7F7', //"#BBD"
  output_off: '#778',
  output_on: '#7F7' //"#BBD"
};
const clear_background_color = '#222';
const background_image = gridImg;
const zoom_modify_alpha = true;
const editor_alpha = 1; // used for transition
const render_canvas_border = true;

/**
 * This class is in charge of rendering one graph inside a canvas. And provides all the interaction required.
 * Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
 */
export class LGraphCanvas {
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly graph?: LGraph,
    readonly options: any = {} as any
  ) {}

  private ds = new DragAndScale(this.canvas);

  render_time = 0;
  last_draw_time = 0;

  bgctx: CanvasRenderingContext2D | null = null;

  viewport: any;

  bg_img?: HTMLImageElement = undefined;
  pattern?: CanvasPattern = undefined;

  /**
   * renders the whole canvas content, by rendering in two separated canvas, one containing the background grid and the connections, and one containing the nodes)
   **/
  draw() {
    if (!this.canvas || this.canvas.width == 0 || this.canvas.height == 0) {
      return;
    }
    const canvas = this.canvas;
    canvas.width = this.canvas.clientWidth;
    canvas.height = this.canvas.clientHeight;

    //fps counting
    const now = getTime();
    this.render_time = (now - this.last_draw_time) * 0.001;
    this.last_draw_time = now;

    if (this.graph) {
      this.ds.computeVisibleArea();
    }

    // -- drawBackCanvas --
    if (!this.bgctx) {
      this.bgctx = canvas.getContext('2d');
    }
    const ctx = this.bgctx!;
    const viewport = [0, 0, ctx.canvas.width, ctx.canvas.height] as const;

    // clear
    ctx.clearRect(viewport[0], viewport[1], viewport[2], viewport[3]);

    // show subgraph stack header
    {
      ctx.save();
      ctx.strokeStyle = '#AAA';
      ctx.lineWidth = 10;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      ctx.lineWidth = 1;
      ctx.font = '40px Arial';
      ctx.textAlign = 'center';
    }

    let bg_already_painted = false;

    if (!this.viewport) {
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    console.log('bg_img', this.bg_img);

    if (this.graph) {
      // apply transformations
      ctx.save();
      this.ds.toCanvasContext(ctx);

      // render BG
      if (this.ds.scale < 1.5 && !bg_already_painted && clear_background_color) {
        ctx.fillStyle = clear_background_color;
        ctx.fillRect(
          this.ds.visible_area[0],
          this.ds.visible_area[1],
          this.ds.visible_area[2],
          this.ds.visible_area[3]
        );
      }

      if (background_image && this.ds.scale > 0.5 && !bg_already_painted) {
        if (zoom_modify_alpha) {
          ctx.globalAlpha = (1.0 - 0.5 / this.ds.scale) * editor_alpha;
        } else {
          ctx.globalAlpha = editor_alpha;
        }
        ctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled = false;

        if (!this.bg_img) {
          this.bg_img = new Image();
          this.bg_img.name = background_image;
          this.bg_img.src = background_image;
          this.bg_img.onload = () => {
            this.draw();
          };
        }

        if (!this.pattern) {
          this.pattern = ctx.createPattern(this.bg_img, 'repeat')!;
        }
        if (this.pattern) {
          console.log('this.pattern', this.ds.visible_area);
          ctx.fillStyle = this.pattern;
          ctx.fillRect(
            this.ds.visible_area[0],
            this.ds.visible_area[1],
            this.ds.visible_area[2],
            this.ds.visible_area[3]
          );
          ctx.fillStyle = 'transparent';
        }

        ctx.globalAlpha = 1.0;
        ctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled = true;
      }

      // todo groups
      // if (this.graph._groups.length) {
      //   this.drawGroups(ctx);
      // }

      if (render_canvas_border) {
        ctx.strokeStyle = '#235';
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      ctx.restore();
    }

    if (this.bg_img) {
      // ctx.drawImage(this.bg_img, 0, 0);
    }

    renderInfo({ ctx });

    {
      ctx.save();
      this.ds.toCanvasContext(ctx);
    }
  }
}

class DragAndScale {
  max_scale = 10;
  min_scale = 0.1;

  scale = 1;
  offset = new Float32Array(2);
  visible_area = new Float32Array(4);

  constructor(readonly element: HTMLCanvasElement | null = null) {}

  toCanvasContext(ctx: CanvasRenderingContext2D): void {
    ctx.scale(this.scale, this.scale);
    ctx.translate(this.offset[0], this.offset[1]);
  }

  computeVisibleArea(viewport?: number[]) {
    if (!this.element) {
      this.visible_area[0] = this.visible_area[1] = this.visible_area[2] = this.visible_area[3] = 0;
      return;
    }
    var width = this.element.width;
    var height = this.element.height;
    var startx = -this.offset[0];
    var starty = -this.offset[1];
    if (viewport) {
      startx += viewport[0] / this.scale;
      starty += viewport[1] / this.scale;
      width = viewport[2];
      height = viewport[3];
    }
    var endx = startx + width / this.scale;
    var endy = starty + height / this.scale;
    this.visible_area[0] = startx;
    this.visible_area[1] = starty;
    this.visible_area[2] = endx - startx;
    this.visible_area[3] = endy - starty;
  }
}

function drawConnections() {}

/**
 * draws some useful stats in the corner of the canvas
 * @method renderInfo
 **/
function renderInfo({
  ctx,
  x,
  y,
  graph,
  visible_nodes,
  fps
}: {
  ctx: CanvasRenderingContext2D;
  x?: number;
  y?: number;
  graph?: LGraph;
  visible_nodes?: any[];
  fps?: number;
}) {
  x = x || 10;
  y = y || ctx.canvas.height - 80;

  ctx.save();
  ctx.translate(x, y);

  ctx.font = '10px Arial';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'left';
  if (graph && visible_nodes && fps) {
    ctx.fillText('T: ' + graph.globaltime.toFixed(2) + 's', 5, 13 * 1);
    ctx.fillText('I: ' + graph.iteration, 5, 13 * 2);
    ctx.fillText('N: ' + graph._nodes.length + ' [' + visible_nodes.length + ']', 5, 13 * 3);
    ctx.fillText('V: ' + graph._version, 5, 13 * 4);
    ctx.fillText('FPS:' + fps.toFixed(2), 5, 13 * 5);
  } else {
    ctx.fillText('No graph selected', 5, 13 * 1);
  }
  ctx.restore();
}
