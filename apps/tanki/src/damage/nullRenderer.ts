import type { createRangeRenderer } from './renderer';

/**
 * A renderer that draws nothing and only hands out field slots, as many as the real one: for a
 * battle played without a GPU, in tests, tools and a replay's second run that only thinks.
 */
export function createNullRenderer() {
  let slots = freshSlots();
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    releaseAllFields: () => (slots = freshSlots()),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall() {},
    addLight() {},
    render() {}
  };

  return renderer as unknown as ReturnType<typeof createRangeRenderer>;
}

/** Slots of the real renderer, 0 handed out first. */
function freshSlots() {
  return Array.from({ length: SLOTS }, (_, index) => SLOTS - 1 - index);
}

const SLOTS = 512;
