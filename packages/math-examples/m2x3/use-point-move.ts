import { Vec2 } from '@packages/math/v2';
import { createSignal } from 'solid-js';
import { usePanHandler } from './use-pan-handler';

export function usePointMove(point: Vec2 = Vec2.create()) {
  const [translation, setTranslation] = createSignal<Vec2>(point, { equals: () => false });
  const { handlePointerDown } = usePanHandler({
    translation,
    setTranslation
  });

  return {
    handlePointerDown,
    translation,
  };
}
