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

      <main class="p-6 mx-auto">
        <nav class="grid grid-cols-[repeat(auto-fit,_minmax(12rem,_1fr))] gap-4">
          <For each={routes}>
            {({ path, name, Preview, children }) => (
              <Show when={!!children} fallback={<LinkPreview path={path} name={name} Preview={Preview} />}>
                <div class="flex place-content-center place-items-center p-2 rounded-2 border-e-15 col-start-1 border-slate-200">
                  <h2 class="text-4xl">{name}</h2>
                </div>
                <For each={children}>
                  {({ path, name, Preview }) => <LinkPreview path={path} name={name} Preview={Preview} />}
                </For>
              </Show>
            )}
          </For>
          <button
            class="flex place-content-center place-items-center  p-2 bg-white border border-solid rounded"
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
  Preview:
    | Component<{
        name: string;
        path: string;
      }>
    | undefined;
}) => (props.Preview ? <props.Preview path={props.path} name={props.name as string} /> : <></>);
