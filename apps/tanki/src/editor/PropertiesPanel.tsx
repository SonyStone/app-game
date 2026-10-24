import { createMemo, For, Match, Show, Switch } from 'solid-js';
import {
  OBJECT_KINDS,
  PIXELS_PER_METER,
  type Building,
  type CapturePoint,
  type Crate,
  type MapObject,
  type MapObjectKind,
  type Road,
  type TankiMap,
  type Wall
} from '../map/format';
import { ringArea } from '../map/geometry';
import { KIND_COLORS, TEAM_COLORS } from './draw';
import {
  changeKind,
  findItem,
  isCapturePoint,
  isObject,
  isSpawn,
  setTeam,
  updateItem,
  type MapItem,
  type VertexRef
} from './edits';
import { Button, NumberField, Section } from './ui';

/**
 * The right-hand panel: properties of the one selected item (its kind, height, width, size,
 * team or radius), a summary of a multiple selection, or the map's own name, size and source
 * when nothing is selected. Every change goes to `onChange` as a new map.
 */
export function PropertiesPanel(props: {
  map: TankiMap;
  selection: readonly string[];
  vertex: VertexRef | undefined;
  onChange: (map: TankiMap) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDeleteVertex: () => void;
  /** Places the King of the Hill spawn zones and capture point. */
  onLayoutKingOfTheHill: () => void;
}) {
  const item = createMemo(() => (props.selection.length === 1 ? findItem(props.map, props.selection[0]) : undefined));
  const object = createMemo(() => {
    const current = item();

    return current && isObject(current) ? current : undefined;
  });

  return (
    <aside class="flex w-64 flex-col overflow-y-auto border-0 border-l border-solid border-[#333] bg-[#202020] text-[#e6e6e6]">
      <Switch>
        <Match when={props.selection.length === 0}>
          <MapProperties
            map={props.map}
            onChange={props.onChange}
            onLayoutKingOfTheHill={props.onLayoutKingOfTheHill}
          />
        </Match>
        <Match when={props.selection.length > 1}>
          <Section title="Selection">
            <p class="m-0 text-xs text-[#cfcfcf]">{props.selection.length} items selected</p>
            <SelectionCounts map={props.map} selection={props.selection} />
          </Section>
        </Match>
        <Match when={object()}>
          {(current) => (
            <>
              <Section title="Type">
                <div class="grid grid-cols-3 gap-1">
                  <For each={OBJECT_KINDS}>
                    {(kind) => (
                      <button
                        type="button"
                        onClick={() => props.onChange(changeKind(props.map, current().id, kind))}
                        aria-pressed={current().kind === kind ? 'true' : 'false'}
                        class={[
                          'flex h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-solid text-[11px] capitalize',
                          current().kind === kind
                            ? 'border-[#ffb020] bg-[#3a3122] text-white'
                            : 'border-[#363636] bg-[#272727] text-[#bdbdbd] hover:border-[#4a4a4a]'
                        ]}
                      >
                        <span
                          class="block h-3.5 w-5 rounded-sm border border-solid border-black"
                          style={{ background: KIND_COLORS[kind] }}
                        />
                        {kind}
                      </button>
                    )}
                  </For>
                </div>
              </Section>
              <ObjectFields object={current()} map={props.map} onChange={props.onChange} />
            </>
          )}
        </Match>
        <Match when={item()}>
          {(current) => <MarkerFields item={current()} map={props.map} onChange={props.onChange} />}
        </Match>
      </Switch>
      <Show when={props.selection.length > 0}>
        <Section title="Actions">
          <div class="grid grid-cols-2 gap-1.5">
            <Button onClick={props.onDuplicate} title="Duplicate (Ctrl+D)">
              Duplicate
            </Button>
            <Button onClick={props.onDelete} tone="danger" title="Delete (Del)">
              Delete
            </Button>
          </div>
          <Show when={props.vertex}>
            <Button onClick={props.onDeleteVertex} wide title="Delete the picked corner (Del, or Alt-click it)">
              Delete corner
            </Button>
          </Show>
        </Section>
      </Show>
    </aside>
  );
}

/** Fields of one terrain object: height, width or box size, and outline statistics. */
function ObjectFields(props: { object: MapObject; map: TankiMap; onChange: (map: TankiMap) => void }) {
  const update = <T extends MapItem>(patch: (item: T) => T) =>
    props.onChange(updateItem(props.map, props.object.id, patch));

  return (
    <Section title="Properties">
      <Switch>
        <Match when={props.object.kind === 'building' || props.object.kind === 'wall' ? props.object : undefined}>
          {(solid) => (
            <NumberField
              label="Height"
              unit="m"
              min={0.5}
              max={300}
              value={solid().height / PIXELS_PER_METER}
              onCommit={(meters) => update<Building | Wall>((item) => ({ ...item, height: meters * PIXELS_PER_METER }))}
            />
          )}
        </Match>
        <Match when={props.object.kind === 'road' ? props.object : undefined}>
          {(road) => (
            <NumberField
              label="Width"
              unit="m"
              min={0.5}
              max={100}
              value={road().width / PIXELS_PER_METER}
              onCommit={(meters) => update<Road>((item) => ({ ...item, width: meters * PIXELS_PER_METER }))}
            />
          )}
        </Match>
        <Match when={props.object.kind === 'crate' ? props.object : undefined}>
          {(crate) => (
            <>
              <NumberField
                label="Width"
                unit="m"
                min={0.2}
                step={0.1}
                value={crate().size.x / PIXELS_PER_METER}
                onCommit={(meters) =>
                  update<Crate>((item) => ({ ...item, size: { ...item.size, x: meters * PIXELS_PER_METER } }))
                }
              />
              <NumberField
                label="Length"
                unit="m"
                min={0.2}
                step={0.1}
                value={crate().size.y / PIXELS_PER_METER}
                onCommit={(meters) =>
                  update<Crate>((item) => ({ ...item, size: { ...item.size, y: meters * PIXELS_PER_METER } }))
                }
              />
              <NumberField
                label="Rotation"
                unit="°"
                step={5}
                digits={0}
                value={(crate().rotation * 180) / Math.PI}
                onCommit={(degrees) => update<Crate>((item) => ({ ...item, rotation: (degrees * Math.PI) / 180 }))}
              />
            </>
          )}
        </Match>
      </Switch>
      <Show when={outlineStats(props.object)}>
        <p class="m-0 text-[11px] leading-relaxed text-[#8a8a8a]">{outlineStats(props.object)}</p>
      </Show>
      <p class="m-0 truncate text-[11px] text-[#6f6f6f]" title={props.object.id}>
        id {props.object.id}
      </p>
    </Section>
  );
}

/** Corner count, courtyards and area of an outline, or road length; empty for crates. */
function outlineStats(object: MapObject) {
  if (object.kind === 'crate') {
    return '';
  }

  if (object.kind === 'road') {
    const length = object.points
      .slice(1)
      .reduce(
        (sum, point, index) => sum + Math.hypot(point.x - object.points[index].x, point.y - object.points[index].y),
        0
      );

    return `${object.points.length} points · ${Math.round(length / PIXELS_PER_METER)} m long`;
  }

  const courtyards =
    object.holes.length > 0 ? ` · ${object.holes.length} courtyard${object.holes.length === 1 ? '' : 's'}` : '';
  const area = ringArea(object.points) - object.holes.reduce((sum, hole) => sum + ringArea(hole), 0);

  return `${object.points.length} corners${courtyards} · ${Math.round(area / PIXELS_PER_METER ** 2)} m²`;
}

/** Fields of a spawn zone (its team) or a capture point (its radius). */
function MarkerFields(props: { item: MapItem; map: TankiMap; onChange: (map: TankiMap) => void }) {
  return (
    <Switch>
      <Match when={isSpawn(props.item) ? props.item : undefined}>
        {(spawn) => (
          <Section title="Spawn zone">
            <div class="grid grid-cols-2 gap-1.5">
              <For each={['red', 'blue'] as const}>
                {(team) => (
                  <button
                    type="button"
                    aria-pressed={spawn().team === team ? 'true' : 'false'}
                    onClick={() => props.onChange(setTeam(props.map, spawn().id, team))}
                    class={[
                      'h-8 cursor-pointer rounded-md border-2 border-solid text-xs font-semibold capitalize',
                      spawn().team === team ? 'text-white' : 'border-[#363636] bg-[#272727] text-[#bdbdbd]'
                    ]}
                    style={
                      spawn().team === team
                        ? { 'border-color': TEAM_COLORS[team].line, background: TEAM_COLORS[team].fill }
                        : {}
                    }
                  >
                    {team}
                  </button>
                )}
              </For>
            </div>
            <p class="m-0 text-[11px] text-[#8a8a8a]">
              {spawn().points.length} corners · {Math.round(ringArea(spawn().points) / PIXELS_PER_METER ** 2)} m²
            </p>
          </Section>
        )}
      </Match>
      <Match when={isCapturePoint(props.item) ? props.item : undefined}>
        {(point) => (
          <Section title="Capture point">
            <NumberField
              label="Radius"
              unit="m"
              min={2}
              max={200}
              value={point().radius / PIXELS_PER_METER}
              onCommit={(meters) =>
                props.onChange(
                  updateItem<CapturePoint>(props.map, point().id, (item) => ({
                    ...item,
                    radius: meters * PIXELS_PER_METER
                  }))
                )
              }
            />
            <p class="m-0 text-[11px] text-[#8a8a8a]">King of the Hill: hold the circle to win.</p>
          </Section>
        )}
      </Match>
    </Switch>
  );
}

/** The map's name, size, source and contents. */
function MapProperties(props: { map: TankiMap; onChange: (map: TankiMap) => void; onLayoutKingOfTheHill: () => void }) {
  const setBounds = (key: 'width' | 'height', meters: number) =>
    props.onChange({ ...props.map, bounds: { ...props.map.bounds, [key]: meters * PIXELS_PER_METER } });

  return (
    <>
      <Section title="Map">
        <label class="flex flex-col gap-1 text-xs text-[#b5b5b5]">
          Name
          <input
            value={props.map.name}
            onChange={(event) =>
              props.onChange({ ...props.map, name: event.currentTarget.value.trim() || 'Untitled map' })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            class="h-7 rounded-md border border-solid border-[#3d3d3d] bg-[#1b1b1b] px-2 text-xs text-[#f0f0f0] outline-none focus:border-[#ffb020]"
          />
        </label>
        <NumberField
          label="Width"
          unit="m"
          min={20}
          max={5000}
          step={10}
          digits={0}
          value={props.map.bounds.width / PIXELS_PER_METER}
          onCommit={(meters) => setBounds('width', meters)}
        />
        <NumberField
          label="Height"
          unit="m"
          min={20}
          max={5000}
          step={10}
          digits={0}
          value={props.map.bounds.height / PIXELS_PER_METER}
          onCommit={(meters) => setBounds('height', meters)}
        />
        <p class="m-0 text-[11px] text-[#8a8a8a]">
          {Math.round(props.map.bounds.width)} × {Math.round(props.map.bounds.height)} world px · {PIXELS_PER_METER} px
          per meter
        </p>
      </Section>
      <Section title="King of the Hill">
        <p class="m-0 text-[11px] leading-relaxed text-[#9a9a9a]">
          {props.map.spawns.filter((spawn) => spawn.team === 'red').length} red and{' '}
          {props.map.spawns.filter((spawn) => spawn.team === 'blue').length} blue spawn zones,{' '}
          {props.map.capturePoints.length} capture point{props.map.capturePoints.length === 1 ? '' : 's'}.
        </p>
        <Button
          onClick={props.onLayoutKingOfTheHill}
          wide
          title="Capture point in the middle, red spawn west, blue spawn east"
        >
          Lay out red vs blue
        </Button>
      </Section>
      <Section title="Contents">
        <SelectionCounts map={props.map} selection={props.map.objects.map((object) => object.id)} />
      </Section>
      <Show when={props.map.source}>
        {(source) => (
          <Section title="Source">
            <p class="m-0 text-[11px] leading-relaxed text-[#9a9a9a]">
              OpenStreetMap, {source().sizeMeters} m around {source().lat.toFixed(5)}, {source().lon.toFixed(5)}
              <br />
              {source().attribution}
            </p>
          </Section>
        )}
      </Show>
    </>
  );
}

/** How many items of each kind `selection` holds, as swatches with counts. */
function SelectionCounts(props: { map: TankiMap; selection: readonly string[] }) {
  const counts = createMemo(() => {
    const result = new Map<MapObjectKind | 'spawn' | 'capture', number>();

    for (const id of props.selection) {
      const item = findItem(props.map, id);
      const key = !item ? undefined : isObject(item) ? item.kind : isSpawn(item) ? 'spawn' : 'capture';

      if (key) {
        result.set(key, (result.get(key) ?? 0) + 1);
      }
    }

    return [...result.entries()];
  });

  return (
    <ul class="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-[11px] text-[#bdbdbd]">
      <For each={counts()}>
        {([kind, count]) => (
          <li class="flex items-center gap-1.5 capitalize">
            <span
              class="block h-2.5 w-3.5 rounded-sm border border-solid border-black"
              style={{
                background:
                  kind in KIND_COLORS ? KIND_COLORS[kind as MapObjectKind] : kind === 'spawn' ? '#ff5a5f' : '#ffd34d'
              }}
            />
            {kind} <span class="ml-auto text-[#8a8a8a]">{count}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
