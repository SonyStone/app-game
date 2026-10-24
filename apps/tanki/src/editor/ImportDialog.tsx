import { createSignal, For, onCleanup, Show } from 'solid-js';
import { PIXELS_PER_METER, type TankiMap } from '../map/format';
import { DEFAULT_OSM_AREA, fetchOverpass, MOSCOW_PLACES, overpassToMap, type OsmArea } from '../map/osm';
import { loadSampleMap } from '../map/sample';
import { Button, Dialog } from './ui';

/**
 * Imports a square of OpenStreetMap around a center the user types or picks from the 2017
 * Moscow places. Shows progress and failures; closing the dialog cancels a running download.
 * The offline sample imports the bundled Overpass reply instead of asking the network.
 */
export function ImportDialog(props: { onImport: (map: TankiMap) => void; onClose: () => void }) {
  const [center, setCenter] = createSignal(formatCenter(DEFAULT_OSM_AREA));
  const [sizeMeters, setSizeMeters] = createSignal(DEFAULT_OSM_AREA.sizeMeters);
  const [status, setStatus] = createSignal<{ busy: boolean; error?: string }>({ busy: false });
  let controller: AbortController | undefined;

  onCleanup(() => controller?.abort());

  return (
    <Dialog title="Import from OpenStreetMap" onClose={props.onClose} width="460px">
      <div class="flex flex-col gap-4 p-4 text-xs">
        <p class="m-0 leading-relaxed text-[#a8a8a8]">
          Buildings, roads, parks and water of a square piece of the city become editable map objects at{' '}
          {PIXELS_PER_METER} px per meter: a tank is about 7 m long.
        </p>
        <div class="flex flex-wrap gap-1.5">
          <For each={MOSCOW_PLACES}>
            {(place) => (
              <button
                type="button"
                onClick={() => setCenter(formatCenter(place))}
                class={[
                  'h-7 cursor-pointer rounded-full border border-solid px-3 text-xs',
                  center() === formatCenter(place)
                    ? 'border-[#ffb020] bg-[#3a3122] text-white'
                    : 'border-[#3d3d3d] bg-[#2b2b2b] text-[#cfcfcf] hover:bg-[#363636]'
                ]}
              >
                {place.name}
              </button>
            )}
          </For>
        </div>
        <label class="flex flex-col gap-1 text-[#b5b5b5]">
          Center (latitude, longitude)
          <input
            value={center()}
            onInput={(event) => setCenter(event.currentTarget.value)}
            placeholder="55.7597, 37.6263"
            class="h-8 rounded-md border border-solid border-[#3d3d3d] bg-[#1b1b1b] px-2 font-mono text-xs text-[#f0f0f0] outline-none focus:border-[#ffb020]"
          />
        </label>
        <label class="flex flex-col gap-1 text-[#b5b5b5]">
          <span class="flex justify-between">
            <span>Size of the square</span>
            <span class="text-[#e6e6e6]">
              {sizeMeters()} m · {Math.round(sizeMeters() * PIXELS_PER_METER)} px
            </span>
          </span>
          <input
            type="range"
            min={100}
            max={1200}
            step={50}
            value={sizeMeters()}
            onInput={(event) => setSizeMeters(Number(event.currentTarget.value))}
            class="accent-[#ffb020]"
          />
        </label>
        <Show
          when={parseCenter(center())}
          fallback={<p class="m-0 text-[#ff8f8f]">Type the center as two numbers: latitude, longitude.</p>}
        >
          {(area) => (
            <a
              href={`https://www.openstreetmap.org/#map=17/${area().lat}/${area().lon}`}
              target="_blank"
              rel="noreferrer"
              class="text-[#8fb8ff] no-underline hover:underline"
            >
              Look at this place on openstreetmap.org ↗
            </a>
          )}
        </Show>
        <Show when={status().error}>
          <p
            role="alert"
            class="m-0 rounded-md border border-solid border-[#5a2b2b] bg-[#3a2323] p-2 leading-relaxed text-[#ffb4b4]"
          >
            {status().error}
          </p>
        </Show>
        <div class="flex items-center justify-between gap-2">
          <Button
            onClick={importSample}
            disabled={status().busy}
            title="Borovitskaya Square from the bundled Overpass reply, no network"
          >
            Offline sample
          </Button>
          <div class="flex gap-2">
            <Button onClick={props.onClose}>Cancel</Button>
            <Button tone="accent" onClick={importArea} disabled={status().busy || !parseCenter(center())}>
              {status().busy ? 'Downloading…' : status().error ? 'Retry' : 'Import'}
            </Button>
          </div>
        </div>
        <p class="m-0 text-[10px] text-[#7a7a7a]">
          Data © OpenStreetMap contributors, ODbL. Downloaded through overpass-api.de.
        </p>
      </div>
    </Dialog>
  );

  async function importArea() {
    const point = parseCenter(center());

    if (!point) {
      return;
    }

    const area: OsmArea = { ...point, sizeMeters: sizeMeters() };
    const place = MOSCOW_PLACES.find((candidate) => formatCenter(candidate) === formatCenter(point));
    controller?.abort();
    const request = new AbortController();
    controller = request;
    setStatus({ busy: true });

    const reply = await fetchOverpass(area, { signal: request.signal });

    if (request.signal.aborted) {
      return;
    }

    const result = reply.ok
      ? overpassToMap(reply.value, area, `${place?.name ?? formatCenter(point)}, ${area.sizeMeters} m`)
      : reply;

    if (!result.ok) {
      setStatus({ busy: false, error: result.error });
      return;
    }

    if (result.value.objects.length === 0) {
      setStatus({ busy: false, error: 'OpenStreetMap has nothing the game shows in this square. Try another place.' });
      return;
    }

    props.onImport(result.value);
  }

  async function importSample() {
    setStatus({ busy: true });

    const result = await loadSampleMap();

    if (result.ok) {
      props.onImport(result.value);
    } else {
      setStatus({ busy: false, error: result.error });
    }
  }
}

function formatCenter(point: { lat: number; lon: number }) {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

/** Latitude and longitude from text like `55.7597, 37.6263`; `undefined` unless both are valid. */
function parseCenter(text: string) {
  const numbers = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  if (numbers.length !== 2) {
    return undefined;
  }

  const [lat, lon] = numbers;

  return Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
}
