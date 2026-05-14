import { Navigation } from '@app-game/app-router';
import { useCamera } from '@app-game/three-examples';
import { Title } from '@solidjs/meta';
import { routes } from './routes';

export default function HomePage() {
  const { toggleCamera, cameraType } = useCamera();

  return (
    <>
      <Title>Home</Title>
      <header class=""></header>
      <main class="mx-auto">
        <nav>
          <Navigation routes={routes} />
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
