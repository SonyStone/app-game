import { useCamera } from '@packages/three-examples/Camera.provider';
import { Title } from '@solidjs/meta';
import { Component, For, JSX, Show } from 'solid-js';
import { routes } from './routes';

export default function HomePage() {
  const { toggleCamera, cameraType } = useCamera();

  return (
    <>
      <Title>Home</Title>
      <header class=""></header>

      <main class="mx-auto p-6">
        <nav class="grid grid-cols-[repeat(auto-fit,_minmax(12rem,_1fr))] gap-4">
          <For each={routes}>
            {({ path, name, Preview, children }) => (
              <>
                <LinkPreview path={path} name={name} as={Preview} />
                <Show when={!!children}>
                  <For each={children}>
                    {(child) => <LinkPreview path={path + child.path} name={child.name} as={child.Preview} />}
                  </For>
                </Show>
              </>
            )}
          </For>
          <button
            class="flex place-content-center place-items-center  rounded border border-solid bg-white p-2"
            onClick={toggleCamera}
          >
            {cameraType()}
          </button>
        </nav>
      </main>
    </>
  );
}

const LinkPreview = (props: {
  path: string;
  name: string | JSX.Element;
  as:
    | Component<{
        name: string;
        path: string;
      }>
    | undefined;
}) => (props.as ? <props.as path={props.path} name={props.name as string} /> : <></>);
