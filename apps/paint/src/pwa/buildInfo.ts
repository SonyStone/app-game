/** Immutable identity of the compiled app, retained by its service-worker cache. */
export type PaintBuild = {
  /** Full source commit, or null when the build has no Git metadata. */
  revision: string | null;
  /** Build time in UTC; in development this is the Vite server start time. */
  builtAt: string;
  development: boolean;
  /** Local production builds may contain edits beyond the named commit. */
  localChanges: boolean;
};

declare const __PAINT_BUILD__: PaintBuild;

/** Vite injects metadata only for the standalone app; tests and other hosts can omit it. */
export const paintBuild = typeof __PAINT_BUILD__ === 'undefined' ? undefined : __PAINT_BUILD__;
