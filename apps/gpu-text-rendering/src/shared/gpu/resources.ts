/** Tracks one owner's allocations, including partial preparation and allocations after cancellation. */
export function createGpuResources() {
  const resources = new Set<{ destroy(): void }>();
  let destroyed = false;

  return {
    keep<T extends { destroy(): void }>(resource: T): T {
      if (destroyed) {
        resource.destroy();
      } else {
        resources.add(resource);
      }

      return resource;
    },

    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      for (const resource of resources) resource.destroy();
      resources.clear();
    }
  };
}

/** Registers a buffer or texture without widening its TypeGPU type. */
export type KeepGpuResource = ReturnType<typeof createGpuResources>['keep'];
