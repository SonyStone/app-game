/**
 * Page demand for one shared virtual-texture atlas viewed by several canvas targets.
 *
 * Each target owns a `PageDemand` that it restarts at the beginning of its own frame. Restarting one target never
 * drops another target's requests, wanted pages or displayed entries, so interleaved target frames cannot cancel each
 * other's in-flight loads or evict each other's visible atlas slots.
 */
export function createPageRequests<Page>() {
  const demands = new Set<DemandState<Page>>();

  return {
    /** Registers one target's demand. Call `release()` when the target is detached. */
    demand(): PageDemand<Page> {
      const state: DemandState<Page> = { requests: new Map(), wanted: new Set(), used: new Set() };
      demands.add(state);

      return {
        begin(pinned) {
          state.requests.clear();
          state.wanted = new Set(pinned);
          state.used.clear();
        },
        want(key) {
          state.wanted.add(key);
        },
        request(key, page, priority) {
          state.wanted.add(key);
          state.requests.set(key, { page, priority });
        },
        use(key) {
          state.used.add(key);
        },
        release() {
          demands.delete(state);
        }
      };
    },

    /** Number of registered targets; the atlas budget is shared between them. */
    get targets() {
      return demands.size;
    },

    /** True while any target's current frame still needs `key`. Loads for unwanted pages are obsolete. */
    wanted(key: string) {
      for (const state of demands) {
        if (state.wanted.has(key)) {
          return true;
        }
      }

      return false;
    },

    /** True when any target displayed the atlas entry in its latest frame; such entries must not be recycled. */
    inUse(key: string) {
      for (const state of demands) {
        if (state.used.has(key)) {
          return true;
        }
      }

      return false;
    },

    /** Distinct requested pages across all targets. */
    pending() {
      return merged().size;
    },

    /**
     * Removes and returns the most urgent request across all targets (lowest priority value, first requested on ties).
     * With `reserve`, a pinned request is preferred so coarse coverage cannot starve behind visible detail.
     */
    take(reserve?: (key: string) => boolean): { key: string; page: Page } | undefined {
      const candidates = [...merged()];
      const chosen =
        (reserve && candidates.find(([key]) => reserve(key))) ??
        candidates.sort((a, b) => a[1].priority - b[1].priority)[0];
      if (!chosen) {
        return undefined;
      }

      const [key, { page }] = chosen;
      for (const state of demands) {
        state.requests.delete(key);
      }

      return { key, page };
    },

    /** Drops every target's requests, for example when the atlas is destroyed. */
    clear() {
      for (const state of demands) {
        state.requests.clear();
      }
    }
  };

  /** Merges target requests in registration order, keeping each page's most urgent priority. */
  function merged() {
    const result = new Map<string, { page: Page; priority: number }>();
    for (const state of demands) {
      for (const [key, request] of state.requests) {
        const existing = result.get(key);
        if (!existing || request.priority < existing.priority) {
          result.set(key, request);
        }
      }
    }

    return result;
  }
}

/** One target's view of the shared page demand, restarted by `begin` for each of its frames. */
export type PageDemand<Page> = {
  /** Starts a frame: keeps only the pinned coverage wanted and forgets this target's previous requests/uses. */
  begin(pinned: Iterable<string>): void;
  /** Marks a page needed by this frame without requesting a load (it is already resident). */
  want(key: string): void;
  /** Requests a load; lower priorities load first. Also marks the page wanted. */
  request(key: string, page: Page, priority: number): void;
  /** Records that this frame displays the resident atlas entry `key`. */
  use(key: string): void;
  /** Unregisters this target; its requests no longer keep loads valid. */
  release(): void;
};

type DemandState<Page> = {
  requests: Map<string, { page: Page; priority: number }>;
  wanted: Set<string>;
  used: Set<string>;
};
