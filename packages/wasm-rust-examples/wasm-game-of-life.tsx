import { onCleanup } from 'solid-js';

import init, { Cell, Universe } from './wasm_game_of_life/pkg/wasm_game_of_life';

export default function WasmGameOfLife() {
  // greet();

  const playPauseButton = (<button>▶</button>) as HTMLButtonElement;
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  let animationId: number | null = null;

  init().then((raw) => {
    console.log('init wasm-pack', raw.memory);

    const CELL_SIZE = 5;
    const GRID_COLOR = '#CCCCCC';
    const DEAD_COLOR = '#FFFFFF';
    const ALIVE_COLOR = '#000000';

    const universe = Universe.new();
    const width = universe.width();
    const height = universe.height();

    canvas.height = (CELL_SIZE + 1) * height + 1;
    canvas.width = (CELL_SIZE + 1) * width + 1;

    const ctx = canvas.getContext('2d')!;
    console.log('init wasm-pack', raw.memory);

    canvas.addEventListener('click', (event) => {
      const boundingRect = canvas.getBoundingClientRect();

      const scaleX = canvas.width / boundingRect.width;
      const scaleY = canvas.height / boundingRect.height;

      const canvasLeft = (event.clientX - boundingRect.left) * 1;
      const canvasTop = (event.clientY - boundingRect.top) * 1;
      const row = Math.min(Math.floor(canvasTop / (CELL_SIZE + 1)), height - 1);
      const col = Math.min(Math.floor(canvasLeft / (CELL_SIZE + 1)), width - 1);

      universe.toggle_cell(row, col);
      drawGrid();
      drawCells();
    });

    const drawGrid = () => {
      ctx.beginPath();
      ctx.strokeStyle = GRID_COLOR;

      for (let i = 0; i <= width; i++) {
        ctx.moveTo(i * (CELL_SIZE + 1) + 1, 0);
        ctx.lineTo(i * (CELL_SIZE + 1) + 1, (CELL_SIZE + 1) * height + 1);
      }

      // Horizontal lines.
      for (let j = 0; j <= height; j++) {
        ctx.moveTo(0, j * (CELL_SIZE + 1) + 1);
        ctx.lineTo((CELL_SIZE + 1) * width + 1, j * (CELL_SIZE + 1) + 1);
      }
      ctx.stroke();
    };

    const getIndex = (row: number, column: number) => {
      return row * width + column;
    };

    const drawCells = () => {
      const cellsPtr = universe.cells(); // byteOffset
      const cells = new Uint8Array(raw.memory.buffer, cellsPtr, width * height);

      ctx.beginPath();

      ctx.fillStyle = ALIVE_COLOR;
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const idx = getIndex(row, col);

          ctx.fillStyle = cells[idx] === Cell.Dead ? DEAD_COLOR : ALIVE_COLOR;

          ctx.fillRect(col * (CELL_SIZE + 1) + 1, row * (CELL_SIZE + 1) + 1, CELL_SIZE, CELL_SIZE);
        }
      }

      ctx.stroke();
    };

    const isPaused = () => {
      return animationId === null;
    };

    //   pre.textContent = universe.render();
    const renderLoop = () => {
      // pre.textContent = universe.render();
      // fps.render();

      drawGrid();
      drawCells();
      // for (let i = 0; i < 90; i++) {
      universe.tick();

      // }
      // universe.tick();
      animationId = requestAnimationFrame(renderLoop);
    };

    const play = () => {
      playPauseButton.textContent = '⏸';
      renderLoop();
    };

    const pause = () => {
      playPauseButton.textContent = '▶';
      cancelAnimationFrame(animationId!);
      animationId = null;
    };

    playPauseButton.addEventListener('click', (event) => {
      if (isPaused()) {
        play();
      } else {
        pause();
      }
    });

    play();
  });

  onCleanup(() => {
    cancelAnimationFrame(animationId!);
  });

  return (
    <>
      {canvas}
      {playPauseButton}
    </>
  );
}
