import { For, Show } from 'solid-js';
import type { SpySandbox } from './sandbox';

/** What the display shows: the sandbox's state with the spots on screen that markers stand at. */
export type SpyHudState = ReturnType<SpySandbox['hud']> & {
  /** The spider's position on screen, in CSS pixels. */
  spiderOnScreen: { x: number; y: number };
  /** Each tank's position on screen. */
  watchersOnScreen: { x: number; y: number }[];
  /** The bot spider's planned way on screen, as SVG polyline points. */
  pathOnScreen: string;
};

/**
 * The sandbox's display over the canvas. Playing the spider: whether it is seen, by how many
 * tanks and how close the others are to noticing it, its hit points, a prompt and a progress
 * ring at a stern it can grab, and the time left in a tank it infected; an eye over every tank
 * that suspects it, and a red rim around the screen while one sees it. Playing a tank: its armor,
 * and whether the spider jammed or hijacked it. Whenever the bot spider plays, its attempts
 * under the current variant; watching, also the way it plans to go.
 */
export function SpyHud(props: { state: SpyHudState | undefined }) {
  return (
    <Show when={props.state}>
      {(state) => (
        <>
          <Show when={state().variant.role === 'spy'}>
            <SpiderPanel state={state()} />
            <Eyes state={state()} />
            <GrabRing state={state()} />
          </Show>
          <Show when={state().variant.role === 'tank'}>
            <TankPanel state={state()} />
          </Show>
          <Show when={state().variant.role === 'watch'}>
            <svg class="pointer-events-none absolute inset-0 h-full w-full">
              <polyline points={state().pathOnScreen} fill="none" stroke="rgba(201, 71, 59, 0.85)" stroke-width="2" stroke-dasharray="6 4" />
            </svg>
            <Eyes state={state()} />
            <div class="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/45 px-3 py-1 text-sm text-white">
              Watching the bot spider: {state().spider.phase}
            </div>
          </Show>
          <Show when={state().variant.role !== 'spy'}>
            <TallyPanel state={state()} />
          </Show>
        </>
      )}
    </Show>
  );
}

/** Whether the spider is seen, suspected or unseen, its hit points and what it is doing. */
function SpiderPanel(props: { state: SpyHudState }) {
  const spider = () => props.state.spider;
  const seenBy = () => props.state.watchers.filter((watcher) => watcher.sees).length;
  const suspicion = () => Math.max(0, ...props.state.watchers.map((watcher) => watcher.suspicion));
  const look = () => {
    if (!spider().alive) {
      return { text: `Squashed · back in ${Math.ceil(spider().respawnIn)} s`, color: 'rgba(0, 0, 0, 0.55)' };
    }

    if (spider().infection) {
      const infection = spider().infection!;
      return {
        text: `Inside the tank · ${infection.left.toFixed(1)} s · F jumps out · ${infection.exposed ? 'they know: it fired' : 'its team takes it for a friend'}`,
        color: infection.exposed ? '#b8392f' : '#7a3fb0'
      };
    }

    if (seenBy() > 0) {
      return { text: `SEEN by ${seenBy()}`, color: '#c9362b' };
    }

    return suspicion() > 0.02 ? { text: 'Suspected', color: '#c98a1e' } : { text: 'Unseen', color: 'rgba(0, 0, 0, 0.5)' };
  };

  return (
    <>
      <div
        class="pointer-events-none absolute inset-0 transition-opacity duration-150"
        style={{ opacity: seenBy() > 0 ? 1 : 0, 'box-shadow': 'inset 0 0 0 6px rgba(201, 54, 43, 0.8), inset 0 0 60px rgba(201, 54, 43, 0.45)' }}
      />
      <div class="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1 text-white">
        <div class="rounded px-4 py-1 text-lg font-bold" style={{ background: look().color }}>
          {look().text}
        </div>
        <Show when={spider().alive && !spider().infection}>
          <div class="h-1.5 w-40 overflow-hidden rounded bg-black/45" title="How close the most suspicious tank is to noticing you">
            <div class="h-full" style={{ width: `${suspicion() * 100}%`, background: suspicion() >= 1 ? '#c9362b' : '#e0a33a' }} />
          </div>
          <div class="flex gap-1">
            <For each={[0, 1]}>
              {(pip) => <div class="h-2.5 w-5 rounded-sm" style={{ background: pip < spider().hp ? '#c9473b' : 'rgba(0, 0, 0, 0.45)' }} />}
            </For>
          </div>
        </Show>
        <Show when={spider().revealLeft > 0}>
          <div class="rounded bg-black/45 px-2 text-xs">Given away · {spider().revealLeft.toFixed(1)} s</div>
        </Show>
      </div>
    </>
  );
}

/** An eye over every tank that suspects the spider, filled by its suspicion, red while it sees it. */
function Eyes(props: { state: SpyHudState }) {
  return (
    <For each={props.state.watchers} keyed={false}>
      {(watcher, index) => (
        <Show when={watcher().suspicion > 0.02 || watcher().sees}>
          <svg
            class="pointer-events-none absolute"
            width="30"
            height="18"
            viewBox="-15 -9 30 18"
            style={{
              left: `${props.state.watchersOnScreen[index].x - 15}px`,
              top: `${props.state.watchersOnScreen[index].y - 48}px`
            }}
          >
            <path d="M -13 0 Q 0 -11 13 0 Q 0 11 -13 0 Z" fill="rgba(255, 255, 255, 0.9)" stroke="#111" stroke-width="1.6" />
            <circle r="4.5" fill={watcher().sees ? '#c9362b' : '#e0a33a'} opacity={0.35 + 0.65 * watcher().suspicion} stroke="#111" stroke-width="1.2" />
          </svg>
        </Show>
      )}
    </For>
  );
}

/** At a stern the spider can grab, the prompt to hold the key; while it holds, a ring filling up. */
function GrabRing(props: { state: SpyHudState }) {
  const circumference = 2 * Math.PI * 16;
  const holding = () => props.state.spider.holding;

  return (
    <Show when={props.state.spider.alive && !props.state.spider.infection && (holding() !== undefined || props.state.spider.grabbable)}>
      <div
        class="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center text-xs font-bold text-white"
        style={{ left: `${props.state.spiderOnScreen.x}px`, top: `${props.state.spiderOnScreen.y + 26}px` }}
      >
        <Show when={holding() !== undefined} fallback={<div class="rounded bg-black/55 px-2 py-0.5">Hold click: {props.state.variant.ability}</div>}>
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="rgba(0, 0, 0, 0.45)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="5" />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="#c9473b"
              stroke-width="5"
              stroke-dasharray={`${(holding() ?? 0) * circumference} ${circumference}`}
              transform="rotate(-90 20 20)"
            />
          </svg>
        </Show>
      </div>
    </Show>
  );
}

/** The player's tank: its armor, or how long it stays jammed, hijacked or destroyed. */
function TankPanel(props: { state: SpyHudState }) {
  const player = () => props.state.player;
  const status = () => {
    if (!player().alive) {
      return { text: `Destroyed · back in ${Math.ceil(player().respawnIn)} s`, color: '#c9362b' };
    }

    if (player().hijackedLeft > 0) {
      return { text: `Hijacked by the spider · ${player().hijackedLeft.toFixed(1)} s`, color: '#7a3fb0' };
    }

    if (player().jammedLeft > 0) {
      return { text: `Jammed · ${player().jammedLeft.toFixed(1)} s`, color: '#2f7fb8' };
    }

    return { text: 'Your tank', color: 'rgba(0, 0, 0, 0.5)' };
  };

  return (
    <div class="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1 text-white">
      <div class="rounded px-4 py-1 text-lg font-bold" style={{ background: status().color }}>
        {status().text}
      </div>
      <div class="h-1.5 w-40 overflow-hidden rounded bg-black/45" title="Armor left">
        <div class="h-full bg-white/80" style={{ width: `${player().armor * 100}%` }} />
      </div>
    </div>
  );
}

/** The bot spider's attempts on sterns under the current variant: how many, how many worked, how long they took and why the rest failed. */
function TallyPanel(props: { state: SpyHudState }) {
  const tally = () => props.state.tally;
  const variant = () => props.state.variant;
  const failures = () =>
    Object.entries(tally().failures)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(' · ');
  const average = () => (tally().times.length > 0 ? tally().times.reduce((sum, time) => sum + time, 0) / tally().times.length : undefined);

  return (
    <div class="pointer-events-none absolute right-3 top-3 rounded bg-black/45 px-3 py-2 text-xs leading-5 text-white">
      <div class="font-bold">
        Bot spider · {variant().visibility} · {variant().ability} · {variant().gait}
      </div>
      <div>
        attempts {tally().attempts} · worked {tally().successes}
        {tally().attempts > 0 ? ` (${Math.round((tally().successes / tally().attempts) * 100)}%)` : ''}
        {average() !== undefined ? ` · ${average()!.toFixed(1)} s each` : ''}
      </div>
      <Show when={failures()}>
        <div class="text-white/70">failed: {failures()}</div>
      </Show>
    </div>
  );
}
