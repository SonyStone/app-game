type CanvasViewportProps = {
  canvasRef: (canvas: HTMLCanvasElement) => void
  status: string
  details: string
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onWheel: (event: WheelEvent) => void
}

export function CanvasViewport(props: CanvasViewportProps) {
  return (
    <div class="canvas-shell">
      <canvas
        ref={props.canvasRef}
        class="h-full w-full touch-none"
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onWheel={props.onWheel}
      />

      <div class="status-panel">
        <div class="font-medium text-stone-950">{props.status}</div>
        <div>{props.details}</div>
      </div>
    </div>
  )
}
