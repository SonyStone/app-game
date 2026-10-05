/**
 * The live relay's WebSocket URL for this page: `?relay=` when the page gives one; next to the dev server, the local
 * relay on port {@link localRelayPort} of the same host, which a tablet that reaches the dev server reaches too
 * (`pnpm --filter @app-game/paint-live dev`); otherwise `/api/server` of this origin, as deployed on Vercel.
 */
export function liveRelayUrl(
  location: Pick<Location, 'search' | 'protocol' | 'hostname' | 'host'>,
  development: boolean
) {
  const given = new URLSearchParams(location.search).get('relay');
  if (given) {
    return given;
  }

  const secure = location.protocol === 'https:';
  return development
    ? `${secure ? 'wss' : 'ws'}://${location.hostname}:${localRelayPort}`
    : `${secure ? 'wss' : 'ws'}://${location.host}/api/server`;
}

/** The port `pnpm --filter @app-game/paint-live dev` listens on. */
export const localRelayPort = 3121;

/** The room a page watches, from `?watch=`; `undefined` for the editor. */
export function watchedRoom(location: Pick<Location, 'search'>) {
  return new URLSearchParams(location.search).get('watch') ?? undefined;
}

/** A link that watches `room`: this page with `?watch=`, keeping a `relay` the page was given. */
export function watchLink(location: Pick<Location, 'href'>, room: string) {
  const url = new URL(location.href);
  const relay = url.searchParams.get('relay');
  url.search = '';
  url.hash = '';
  url.searchParams.set('watch', room);
  if (relay) {
    url.searchParams.set('relay', relay);
  }

  return url.href;
}
