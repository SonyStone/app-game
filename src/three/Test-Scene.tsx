import { createSignal, For } from "solid-js";
import { Cube } from "./elements";

export default function TestScene() {
  const [y, setY] = createSignal(20);

  return (
    <>
      <div style={{ position: "absolute", top: 0 }}>
        <input
          type="range"
          min={-20}
          max={20}
          step={0.01}
          value={y()}
          onInput={(e) => {
            setY(parseFloat((e.target as any).value));
          }}
        />
      </div>
      <Cube width={20} height={20} depth={20} x={50} color={"red"}>
        <Cube width={20} height={20} depth={20} x={40} color={"blue"}></Cube>
        <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}>
          {(x) => (
            <Cube
              width={20}
              height={20}
              depth={20}
              x={Math.cos(x) * 20}
              z={Math.sin(x) * 20}
              y={x * y()}
              color={0x00000 + x * 20}
            />
          )}
        </For>
      </Cube>
      <Cube width={20} height={20} depth={20} x={40} z={40} y={-40} />
      <Cube width={20} height={20} depth={20} x={40} z={20} />
      <Cube width={20} height={20} depth={20} x={40} z={40} y={-80} />
    </>
  );
}
