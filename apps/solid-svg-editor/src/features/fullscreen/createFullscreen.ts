import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';

export function createFullscreen(target: Accessor<Element | undefined>) {
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const syncFullscreen = () => {
    setIsFullscreen(document.fullscreenElement === target());
  };

  onMount(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();

    onCleanup(() => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
    });
  });

  function toggleFullscreen(): void {
    const element = target();

    if (!element) {
      return;
    }

    const action = document.fullscreenElement ? document.exitFullscreen() : element.requestFullscreen();
    void action.catch(syncFullscreen);
  }

  return {
    isFullscreen,
    toggleFullscreen
  };
}
