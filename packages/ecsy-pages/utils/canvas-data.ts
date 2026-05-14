export class CanvasContext {
  ctx!: CanvasRenderingContext2D;
}

export class CanvasSize {
  width = 0;
  height = 0;
}

export class CanvasData {

  width: number;
  height: number;
  ctx: CanvasRenderingContext2D;

  private sizeUpdateListener: (this: Window, ev: UIEvent) => void = () => {};

  constructor(
    public canvas: HTMLCanvasElement
  ) {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext('2d')!;
  }

  getContext(): CanvasContext {
    return {
      ctx: this.ctx
    };
  }

  getSize(): CanvasSize {
    return {
      height: this.height,
      width: this.width
    };
  }

  resizeUpdater(component: CanvasSize): void {
    this.sizeUpdateListener = () => {
      component.width = this.canvas.width = window.innerWidth;
      component.height = this.canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', this.sizeUpdateListener, false);
  }

  destroy(): void {
    window.removeEventListener('resize', this.sizeUpdateListener);
  }
}