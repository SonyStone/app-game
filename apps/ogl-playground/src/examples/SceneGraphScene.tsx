import {
  Box,
  Camera,
  Mesh,
  Program,
  Sphere,
  createShared,
  useTime,
} from '@work-ilyas/solid-ogl';
import { createEffect, For, Match, Switch, type Component } from 'solid-js';
import sceneGraphVertex from './scene-graph.vert?raw';
import sceneGraphFragment from './scene-graph.frag?raw';

const random = createRng(7);

export function SceneGraphScene(props: { makeDefault?: boolean }) {
  const BoxGeometry = createShared(() => (
    <Box width={0.3} height={0.3} depth={0.3} />
  ));
  const SphereGeometry = createShared(() => <Sphere radius={0.15} />);
  const SharedProgram = createShared(() => (
    <Program vertex={sceneGraphVertex} fragment={sceneGraphFragment} />
  ));

  return (
    <>
      <Camera
        makeDefault={props.makeDefault}
        position={[0, 1, 7]}
        lookAt={[0, 0, 0]}
      />
      <SceneGraphBranch
        descendantCount={50}
        kind="sphere"
        position={[0, 0, 0]}
        scale={1}
        speed={-0.5}
        BoxGeometry={BoxGeometry}
        SphereGeometry={SphereGeometry}
        SharedProgram={SharedProgram}
      />
    </>
  );
}

function SceneGraphBranch(props: {
  descendantCount: number;
  kind: 'box' | 'sphere';
  position: readonly [number, number, number];
  scale: number;
  speed: number;
  BoxGeometry: Component;
  SphereGeometry: Component;
  SharedProgram: Component;
}) {
  return (
    <Mesh
      ref={(node) => {
        const speed = props.speed;
        const time = useTime();

        createEffect(() => {
          const t = time();
          node.rotation.y = t * speed * 0.8;
          node.rotation.x = t * speed * 0.6;
          node.rotation.z = t * speed * 0.2;
        });
      }}
      position={props.position}
      scale={props.scale}>
      <Switch>
        <Match when={props.kind === 'box'}>
          <props.BoxGeometry />
        </Match>
        <Match when={props.kind === 'sphere'}>
          <props.SphereGeometry />
        </Match>
      </Switch>
      <props.SharedProgram />

      <For each={getDescendantCount(props.descendantCount)}>
        {(childDescendantCount) => (
          <SceneGraphBranch
            descendantCount={childDescendantCount}
            kind={random() > 0.5 ? 'box' : 'sphere'}
            position={[
              (random() - 0.5) * 3,
              (random() - 0.5) * 3,
              (random() - 0.5) * 3,
            ]}
            scale={random() * 0.3 + 0.7}
            speed={(random() - 0.5) * 0.7}
            BoxGeometry={props.BoxGeometry}
            SphereGeometry={props.SphereGeometry}
            SharedProgram={props.SharedProgram}
          />
        )}
      </For>
    </Mesh>
  );
}

function getDescendantCount(descendantCount: number) {
  const childDescendantCounts: number[] = [];
  let remainingDescendants = descendantCount;

  while (remainingDescendants > 0) {
    const remainingAfterChild = remainingDescendants - 1;
    const maxChildDescendants = Math.min(remainingAfterChild, 6);
    const descendantCount =
      maxChildDescendants > 0
        ? Math.floor(random() * (maxChildDescendants + 1))
        : 0;

    childDescendantCounts.push(descendantCount);
    remainingDescendants -= descendantCount + 1;
  }

  return childDescendantCounts;
}

function createRng(seed: number) {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
