import { createSignal } from "solid-js";

export default function MouseMove() {
  const [pos, setPos] = createSignal({x: 0, y: 0});

  console.log(`created MouseMove`);

  function handleMouseMove(event: PointerEvent) {
    setPos({
      x: event.clientX,
      y: event.clientY
    });
  }

  const html = (
    <div onPointerMove={handleMouseMove}>
      The mouse position is {pos().x} x {pos().y}
    </div>
  );

  console.log(`html 2`, html);

  return html
}
