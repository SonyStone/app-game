import { Navigation } from '@app-game/app-router';
import { Title } from '@solidjs/meta';
import { routes } from './routes';

export default function HomePage() {
  return (
    <>
      <Title>Home</Title>
      <header class=""></header>
      <main class="relative mx-auto min-h-screen">
        <AppTitle />
        <nav>
          <Navigation routes={routes} />
        </nav>
        <Background />
      </main>
    </>
  );
}

function AppTitle() {
  return (
    <div class="relative mb-16 text-center">
      <h1 class="font-geist pt-40 pb-8 text-5xl font-bold tracking-tight text-gray-900 md:text-6xl">
        Welcome to the Examples Hub
      </h1>
    </div>
  );
}

function Background() {
  return (
    <div
      class="pointer-events-none absolute inset-0 -z-1 bg-[#f1f1f1]"
      style="
            background-image:linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px);
            background-size:32px 32px
            "
    ></div>
  );
}
