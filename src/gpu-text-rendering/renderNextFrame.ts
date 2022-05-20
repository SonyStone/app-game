export const mustRenderNextFrame = { value : false };

export function forceAnimationChange() {
  mustRenderNextFrame.value = true;
}