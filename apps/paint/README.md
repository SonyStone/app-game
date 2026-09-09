# Paint

Standalone Solid 2 / TypeGPU drawing app. Start it from the workspace root:

```sh
pnpm --filter @app-game/paint dev
```

Open http://localhost:3030. The same editor remains available at `/paint/studio`
in the web playground. Browser storage belongs to an origin, so drawings saved
on the playground port stay there. Use **Save file** and **Open** to move a
saved drawing to the standalone app.

```sh
pnpm --filter @app-game/paint typecheck
pnpm --filter @app-game/paint test
pnpm --filter @app-game/paint test:ui
pnpm --filter @app-game/paint build
pnpm --filter @app-game/paint preview
```

Production output is `apps/paint/dist`. The `*:studio` script names remain as
aliases for existing workflows.

- `src/main.tsx` mounts the standalone editor.
- `src/PaintStudio.tsx` is the shared editor exported as `@app-game/paint/editor`.
- `src/composition` contains the JSX recipes and providers, still exported as
  `@app-game/paint/studio/composition`.
- [Editor documentation](src/README.md) and [maintenance notes](src/MAINTENANCE.md)
  cover rendering, persistence, and browser GPU checks.

Shared ABR parsing, brush engines, and navigation puck remain in `packages`.
Older playground drawing experiments remain in `packages/paint`, named
`@app-game/paint-examples`.

## Install and offline use

PWA support is enabled in production builds. Run `pnpm --filter @app-game/paint build`
then `pnpm --filter @app-game/paint preview` and open http://localhost:4030.
Use **Drawing menu → Install Paint** when offered, or the browser's installation
menu. On iPad/iPhone, use Safari's **Share → Add to Home Screen**.

For deployment, serve `dist` at the root of an HTTPS origin. Plain HTTP on a LAN
IP does not enable the service worker; use HTTPS when testing from a tablet.
Serve `sw.js`, `index.html`, and `manifest.webmanifest` with revalidation rather
than a long immutable cache lifetime. Hashed `assets/` files can use immutable
caching.

The drawing menu shows **Ready to work offline** after the editor has been
cached. The cache includes lazy editor modules, painting/ABR workers, icons,
example thumbnails and color-management WASM. The initial app cache is about
2.8 MiB. Large `.abr` example packs are excluded and need a connection to download;
local drawing persistence still uses the existing IndexedDB implementation.

New versions use the [Vite PWA waiting-worker strategy](https://vite-pwa-org.netlify.app/guide/prompt-for-update).
Paint never calls `skipWaiting` or reloads the page for an update. After the
menu reports an update, finish saving and close every Paint window/tab before
reopening. Installation and offline caching apply only to the standalone app,
not the playground route. Vite development mode intentionally does not install
a service worker.

Validation: production build generated a manifest and a 36-entry precache;
Chrome showed the install prompt was available, reloaded with the preview
server stopped, and rendered/undid a stroke without that server. UI tests cover
waiting updates, existing-worker readiness, one-shot installation and disposal.

## Vercel and Git LFS

ABR example files are stored in Git LFS. Enable **Project Settings → Git →
Git Large File Storage (LFS)** for the Paint project before deploying. After
changing this setting, redeploy; existing deployments still contain the old
assets. See [Vercel Git settings](https://vercel.com/docs/project-configuration/git-settings).

For a local checkout, run `git lfs install` and `git lfs pull`. Both Paint and
ABR Viewer validate example headers at the start of a Vite production build,
including when Vercel invokes `vite build` directly. A remaining pointer makes
the build fail with instructions instead of publishing a broken gallery.

After redeploying a PWA, save your drawing and close all Paint windows before
reopening to use the new version. Local `.abr` import remains available while
a deployment's example files are unavailable.
