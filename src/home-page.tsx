import { useCamera } from '@packages/three-examples/Camera.provider';
import { Title } from '@solidjs/meta';
import { Link } from '@solidjs/router';
import { For } from 'solid-js';
import { routes } from './routes';

export default function HomePage() {
  const { toggleCamera, cameraType } = useCamera();

  return (
    <>
      <Title>Home</Title>
      <header class=""></header>

      <main class="p-6 mx-auto">
        <nav class="grid grid-cols-[repeat(auto-fit,_minmax(12rem,_1fr))] gap-4 ">
          <For each={routes}>
            {({ path, name, Preview }) =>
              Preview ? (
                <Preview />
              ) : (
                <Link class="aspect-square w-full text-2xl p-2 bg-white border border-solid rounded" href={path}>
                  {name}
                </Link>
              )
            }
          </For>
          <button class="w-20 h-20 p-2 bg-white border border-solid rounded" onClick={toggleCamera}>
            {cameraType()}
          </button>
        </nav>
      </main>
    </>
  );
}
