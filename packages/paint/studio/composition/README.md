# Сборка приложения рисования

Studio использует `StudioApplication.tsx` и в worker, и в main-thread режиме. `paintRuntime.ts` получает зависимости из JSX Provider. В очереди команд нет выбора конкретного хранилища, renderer или алгоритма сглаживания.

Публичный импорт: `@app-game/paint/studio/composition`. Рецепт состоит из обычных Solid 2 компонентов без DOM-элементов. `createPaintApplication` создаёт Solid root и материализует JSX через `flatten`; поэтому тот же рецепт выполняется в worker. Настройки GPU не пересылаются через `postMessage`: Vite собирает рецепт отдельно для каждого режима.

## Пример другой сборки

Этот пример создаёт scratchpad с хранилищем в памяти и дополнительным изменяемым canvas. `openMemory` живёт вне компонента, чтобы повторный запуск с тем же `storageName` восстановил checkpoint. Данные исчезнут при закрытии страницы.

```tsx
import { createSignal } from 'solid-js';
import {
  createPaintApplication,
  Document,
  Storage,
  Renderer,
  StrokeProcessor,
  BrushEngines,
  BrushResources,
  createBrushResources,
  PaintRuntime,
  CanvasTarget,
  createDocument,
  createMemoryStorage,
  createPaintRenderer,
  studioProcessors,
  roundBrushEngine,
  defaultCamera
} from '@app-game/paint/studio/composition';

const openMemory = createMemoryStorage();
const [preview, setPreview] = createSignal<HTMLCanvasElement | undefined>(undefined);
const runtime = createPaintApplication(
  (binding) => (
    <Document document={() => createDocument({ paged: true })}>
      <Storage storage={openMemory}>
        <Renderer renderer={createPaintRenderer}>
          <StrokeProcessor processors={studioProcessors} selectProcessor={(brush) => brush.stroke.mode}>
            <BrushEngines
              engines={{ round: roundBrushEngine, eraser: roundBrushEngine }}
              selectEngine={(brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')}
            >
              <BrushResources resources={createBrushResources}>
                <PaintRuntime {...binding}>
                  <CanvasTarget
                    id="overview"
                    canvas={preview()}
                    camera={{ ...defaultCamera(), zoom: 0.1 }}
                    size={{ width: 240, height: 180 }}
                    dpr={1}
                  />
                </PaintRuntime>
              </BrushResources>
            </BrushEngines>
          </StrokeProcessor>
        </Renderer>
      </Storage>
    </Document>
  ),
  (event) => console.log(event),
  () => {}
);

runtime.send({
  type: 'init',
  canvas: document.createElement('canvas'),
  size: { width: 800, height: 600 },
  dpr: 1,
  storageName: 'scratchpad'
});
setPreview(document.createElement('canvas'));
// setPreview(otherCanvas) заменяет цель, setPreview(undefined) отключает её.
// Для согласованного завершения: runtime.send({ type: 'dispose' }).
// runtime.terminate() только освобождает ресурсы после очереди; не сохраняет активный мазок.
```

Для долговременного браузерного хранения передать `createTileStore`. Provider должен находиться выше `PaintRuntime`; порядок соседних компонентов не определяет зависимости. Один `createPaintApplication` содержит ровно один `PaintRuntime`.

## Алгоритмы и кисти

`StrokeProcessor` принимает реестр фабрик и функцию выбора ID. Алгоритм выдаёт `Sample[]`: положение, давление и время. None сохраняет реальные точки; Studio строит midpoint-кривую; Leonardo использует фильтр и cubic-кривую. Расстановка отпечатков принадлежит кисти, поэтому даже None соединяет редкие события непрерывными отпечатками, не меняя траекторию сглаживанием.

`BrushEngines` принимает реестр и `selectEngine(brush)`. Выбор движка и процессора выполняется один раз при `begin`; они остаются у текущего мазка до `finish` или `cancel`. Реестры подключаются при запуске приложения. Функции выбора могут читать настройки, в том числе сигналы в своей среде исполнения. При worker-режиме настройки из UI надо передать командой, поскольку сигнал главного потока не доступен в worker.

Собственный движок реализует `BrushEngine` из `contracts.ts`. Он получает слой, настройки, процессор и renderer. `add` принимает точки, `preview` обновляет временное изображение, `finish` возвращает `TileChange[]` для атомарного commit, `cancel` освобождает временное состояние. Тип вывода не ограничен `Dab[]`. Готовые тайлы неизменяемы; preview не попадает в историю или storage. Несколько движков получают один кеш декодированных текстур через `resources`; runtime удерживает используемые ресурсы до завершения мазка.

Для декодированного ABR-наконечника есть `texturedBrush`, который растеризует покрытие в тайлы Studio. Экспериментальный инструмент ABR Brush открывает общий ABR-viewer для импорта и выбора наконечника; динамика пресетов Photoshop пока не переносится. Сейчас `PaintRenderer` описывает существующий растровый backend Studio; контракта произвольных векторных документов здесь нет.

## Типизированные настройки движка

`defineBrushEngine` связывает ID, проверку настроек и фабрику мазка. Тип `settings` выводится из результата `parse`, поэтому внутри движка не нужны приведения из `unknown`. `select` проверяет и копирует настройки на стороне вызывающего кода; получатель снова проверяет их до создания GPU-состояния. Это действует и для локального runtime, и для worker. Ошибка настройки отправляется как обычное событие `error`, не начиная новый мазок и не помечая неизменённый документ как dirty.

Рабочий пример своего профиля поверх круглого движка:

```tsx
import { z } from 'zod';
import { defineBrushEngine, roundBrush, BrushEngines, defaultBrush } from '@app-game/paint/studio/composition';

const inkSettings = z
  .object({
    flow: z.number().min(0).max(1),
    hardness: z.number().min(0).max(1)
  })
  .strict();

const ink = defineBrushEngine({
  id: 'ink',
  parse: (input) => inkSettings.parse(input),
  create: ({ settings, ...context }) =>
    roundBrush.engine({
      ...context,
      brush: { ...context.brush, flow: settings.flow },
      settings: { hardness: settings.hardness }
    })
});

// В JSX-рецепте вокруг PaintRuntime:
<BrushEngines engines={{ round: roundBrush.engine, ink: ink.engine }} selectEngine={() => 'round'}>
  {/* PaintRuntime и CanvasTarget */}
</BrushEngines>;

const brush = {
  ...defaultBrush(),
  engine: ink.select({ flow: 0.5, hardness: 1 })
};
// Передать brush в обычную команду begin. Все последующие samples относятся к этому же движку.
```

Явный `brush.engine.id` имеет приоритет над `selectEngine`. Без `brush.engine` сохраняется прежний выбор по инструменту. Настройки фиксируются при начале мазка; изменения исходного объекта не меняют текущий мазок. Неизвестные ID отклоняются, без молчаливого перехода на другой движок.

Встроенный `roundBrush.select({ hardness, spacing })` задаёт необязательные переопределения текущих настроек круглой кисти. Пропущенные или `undefined` значения оставляют значения из `Brush`. Пресет явно переопределяет эти поля; UI, редактирующий такой пресет, должен обновлять его `engine.settings`.

Настройки должны переноситься через `structuredClone`. Пиксели ABR-tip и dual-tip загружаются отдельной командой; в `begin` передаются их ID. Декодированные наконечники растеризуются через `texturedBrush`; UI-загрузчик находится в `brushLibrary/`.

## Ресурсы кистей

`BrushResources` задаёт фабрику кеша в JSX. Каждому runtime нужен собственный экземпляр. В Studio по умолчанию это `createBrushResources` с лимитами 64 MiB декодированных пикселей и 4096 записей. Другие сборки могут задать бюджет:

```tsx
<BrushResources resources={() => createBrushResources({ maxBytes: 32 * 1024 * 1024 })}>
  <PaintRuntime {...binding} />
</BrushResources>
```

Протокол одинаков в главном потоке и worker. Загрузить наконечник заранее, например при выборе пресета:

```ts
runtime.send({
  type: 'brush-resources',
  requestId: 'load-tip-1',
  action: 'put',
  resource: {
    id: 'tip:my-brush:v1',
    width: 2,
    height: 2,
    format: 'r8unorm',
    pixels: new Uint8Array([0, 128, 128, 255])
  }
});
```

Обработчик событий получает `brush-resources` с тем же `requestId` и типизированным `result`. При `result.ok` доступны `value.stats` и `value.evicted`. При отказе доступен `error: string`. Перед началом мазка нужно дождаться успешной загрузки. Отправитель должен учитывать `evicted` и хранить исходник для повторной загрузки. `action: 'stats'` возвращает байты, число записей и удержанные байты. `action: 'delete', id` удаляет неиспользуемый ресурс. Эти команды не меняют документ и не запускают автосохранение.

Движок получает пиксели через `resources.get(settings.tipId)`. Все необходимые ID следует разрешить в начале фабрики, до создания GPU-состояния. Отсутствующий ресурс вызывает явную ошибку. `get` удерживает запись до окончания мазка; повторные обращения и следующие мазки используют те же пиксели без копирования. Нельзя изменять или передавать заимствованный буфер. Копия создаётся один раз при приёме загрузки. Транспорт дополнительно копирует данные согласно правилам `postMessage` / локального endpoint.

LRU вытесняет только неиспользуемые записи. Дублирующийся ID отклоняется: новая версия текстуры должна иметь новый ID. Неверный формат, размер, длина буфера или превышение бюджета не меняют существующий кеш. `r8unorm` хранит покрытие: 0 означает прозрачность, 255 полную непрозрачность. Поддерживаются размеры от 1 до 16384 на сторону при соблюдении бюджета. Цветные RGBA-patterns пока не входят в этот формат.

Runtime снимает удержание ресурсов после `finish`, `cancel`, ошибки фабрики/ввода/завершения и потери device. Отказ отмены сохраняет обе ошибки в `AggregateError`. Завершение runtime отменяет активный мазок и освобождает кеш. Импорт документа и восстановление renderer сохраняют ресурсы выбранных кистей. Переключение main/worker создаёт другой runtime. `createPaintSession` ждёт повторной загрузки выбранного наконечника через `brushLibrary.restore()` перед включением ввода.

Это кеш декодированных CPU-пикселей. Отдельный GPU-кеш в `gpu/texturedStamps.ts` обслуживает растеризацию `texturedBrush`. Ресурсы кистей не записываются в `.paint` или IndexedDB документа; сохранённый рисунок уже содержит растровые тайлы. UI удерживает исходные пиксели одной библиотеки до перезагрузки страницы и повторно загружает выбранный наконечник при смене runtime. Постоянного хранилища библиотек пока нет.

## Текстурный BrushEngine

`texturedBrush` зарегистрирован в production-рецепте Studio и доступен другим JSX-сборкам:

```tsx
<BrushEngines engines={{ round: roundBrush.engine, textured: texturedBrush.engine }} selectEngine={() => 'round'}>
  {/* BrushResources и PaintRuntime */}
</BrushEngines>
```

После успешной загрузки ресурса выбрать его для мазка:

```ts
const brush = {
  ...defaultBrush(),
  size: 128,
  engine: texturedBrush.select({ tipId: 'tip:my-brush:v1', angle: Math.PI / 4, spacing: 0.08 })
};
runtime.send({ type: 'begin', brush, samples: [{ x: 0, y: 0, pressure: 0.5, time: performance.now() }] });
// Далее обычные samples и end. tool: 'eraser' использует тот же наконечник для стирания.
```

`size` задаёт длину большей стороны, пропорции берутся из текстуры. `angle` означает поворот по часовой стрелке в радианах, по умолчанию 0; `spacing` необязательно переопределяет настройку Brush. Покрытие наконечника заменяет `hardness`. Сглаживание ввода, давление, flow, opacity и смешивание цвета остаются общими со Studio. Отпечатки используют описанную окружность при поиске тайлов, поэтому повёрнутые прямоугольные углы не обрезаются.

Read-only entry point `@app-game/abr-parser/reader` общего парсера ABR-viewer возвращает `brushTip` с `width`, `height`, `data`. Для команды загрузки передать `pixels: brushTip.data`, `format: 'r8unorm'` и собственный версионный ID. `data` уже нормализованы в 8-битное покрытие, даже если `depth` исходного ABR равен 16. Studio не импортирует код приложения ABR-viewer: тестовый QA-хост передаёт результат общего парсера через этот же контракт.

GPU-кеш создаётся при первом текстурном мазке. Текстура, mip-уровни и bind group переиспользуются между мазками и canvas одного renderer. Лимит составляет 64 MiB с учётом mip-уровней и 256 записей; вытеснение происходит между мазками. Идентичность ресурса, а не строковый ID, определяет повторную загрузку: новый ресурс после удаления старого ID не получит устаревшую GPU-текстуру. GPU-кеш не удерживает CPU-буферы. Потеря renderer освобождает GPU-копии; следующий мазок загружает их из сохранившегося CPU-кеша.

Текущая поддержка охватывает grayscale tip, постоянный поворот, пропорции и базовые настройки мазка. Scattering, angle/roundness dynamics, dual brush, patterns, wet edges и полное воспроизведение Photoshop пока не подключены. В обычном UI Studio круглая кисть выбрана по умолчанию. После импорта можно выбрать наконечник с миниатюрой, изменить размер, flow, opacity и spacing или вернуться к Soft round.

## Импорт ABR в Studio

Отдельный инструмент **ABR Brush** открывает настройки через `brushLibrary/AbrViewerDialog.tsx`. Диалог лениво загружает настоящий `App` из `@app-game/abr-viewer/editor`. Экспорт `onUseBrush` позволяет встроить редактор в другой host без зависимости viewer от Paint. Кнопка **Use in Paint** передаёт текущий отредактированный пресет; ошибка host отображается в статусе viewer. Закрытие диалога сохраняет его workspace и правки до размонтирования Studio. Нативный dialog изолирует фокус и клавиатурные команды от рисования. Скрытые preview-canvas приостанавливаются существующим IntersectionObserver viewer.

`viewerBrush.ts` создаёт снимок полного пресета и его ресурсов для `abrBrush`. Общая библиотека `packages/abr-brush` используется также viewer: настройки, динамика, сглаживание, процедурные наконечники и coverage-эффекты. Paint применяет размер до 5000 px, spacing до 1000%, roundness/flips, scatter, transfer, color dynamics, texture и dual tip. Flow/Opacity, режим наложения и pressure overrides берутся из сохранённых tool options. None обходит сглаживание пресета. Подробные ограничения и статус сравнения с Photoshop: [ABR engine](../../../abr-brush/README.md). Отдельный наконечник ограничен 8192 px / 32 MiB; весь пресет — 48 MiB CPU / 64 MiB GPU с mipmaps.

`createBrushLibrary` ждёт подтверждения `brush-resources` перед применением выбора. Обычная Brush и ABR Brush сохраняют отдельные профили. При смене main/worker все ресурсы выбранного пресета загружаются до включения ввода. Загрузка ограничена 30 секундами; после таймаута корреляция остаётся до ответа или отключения endpoint, поскольку timeout не отменяет отправленную команду. Успешные ответы обновляют резидентность с учётом вытеснений.

`BrushLibraryPanel` и `importAbr` остаются альтернативным компактным picker для других сборок. Его одноразовый Vite worker использует read-only parser с лимитами 32 MiB исходного файла и 64 MiB декодированного покрытия. Текущий ABR Brush использует собственный импорт и полный workspace ABR-viewer. Эти пути не следует путать: ограничение компактного декодера не распространяется на весь workspace viewer.

Библиотека и отредактированные пресеты живут до перезагрузки страницы. Документ `.paint` и автосохранение содержат растровые мазки, а не библиотеку. Чтобы сохранить изменения пресетов, используйте Export в ABR-viewer. Отдельная production-сборка Paint включает UnoCSS и preview-worker viewer; файлы встроенных примеров запрашиваются только при выборе примера.

## Canvas и ресурсы

`CanvasTarget` читает `canvas`, `camera`, `size`, `dpr` реактивно. ID фиксируется при создании компонента; для изменения ID компонент нужно перемонтировать. Удаление компонента отключает цель. ID `main` заменяет основной canvas, камеру редактирования и цель PNG-экспорта. Остальные ID создают дополнительные представления того же документа.

Замена проходит через очередь runtime после текущего GPU-вызова. Это не перезагрузка страницы и не перезапуск renderer. Один физический canvas может принадлежать только одной цели. Копируется описание viewport; сам canvas сохраняет идентичность. Дополнительные цели отображаются перед основной, чтобы экспорт и диагностика относились к редактируемому виду.

У целей общие device, tile cache, raster pipelines и readback. Каждая хранит собственные viewport-текстуры и fallback. Каждая цель независимо учитывает изменённые тайлы. Переключение между видами сохраняет их готовое изображение: повторная композиция выполняется только в изменённой области, а для изменений вне кадра пропускается. Версия кадра не позволяет потерять обновление, пришедшее во время ожидания GPU или загрузки тайлов. После 4096 различных накопленных тайлов список заменяется флагом полной перерисовки, чтобы не удерживать неограниченную историю скрытого вида. Изменение камеры, параметров слоёв, сброс документа и обновление VT-покрытия по-прежнему могут потребовать полного обновления. Дополнительные полноразмерные виды увеличивают GPU-память и время кадра. Для overview задавать небольшие размеры. `releaseTarget` освобождает ресурсы отключённой цели.

HTMLCanvasElement работает в главном потоке. OffscreenCanvas должен принадлежать среде, где работает renderer: передать его в worker можно один раз. Signals управляют уже доступными объектами; они не отменяют браузерные правила владения и передачи canvas. Переключатель main/worker в интерфейсе по-прежнему делает checkpoint, заменяет DOM-canvas и запускает рецепт в другой среде без перезагрузки страницы.

## Storage и multiplayer

`PaintStorage` хранит неизменяемые версии high-res тайлов, derived low-res и согласованный checkpoint документа. `collect` должен сохранять версии из checkpoint и переданные ссылки undo/redo. Контракт и результаты ошибок описаны в `contracts.ts` и `../MAINTENANCE.md`. Есть два адаптера: IndexedDB и memory. NativeStorage можно подключить через тот же Provider, сохранив эти гарантии.

Multiplayer требует отдельного протокола операций документа: порядок мазков и правок слоёв, конфликты, авторство undo и сетевую синхронизацию. Его нельзя корректно реализовать одной заменой storage. Растровый документ и ordered runtime остаются местом применения согласованных операций.

## Проверки

- `brushLibrary/*.test.ts*`: реальный ABR, лимит декодирования, подтверждение загрузки, восстановление выбора, ошибки, поздний ответ, timeout и отмена worker.
- `PaintApplication.test.tsx`: выбор движка/процессора на границе мазка, signals для замены и удаления целей, неизвестный ID.
- `brushResources.test.ts`: бюджет, LRU, удержание активных ресурсов, атомарность ошибок и освобождение при сбое движка.
- `memoryStorage.test.ts`: изоляция, immutable snapshots, restore, atomic failure, сохранение undo при collect.
- QA **Check textured brushes**: настоящий ABR-наконечник, прозрачность, пропорции, поворот, preview/commit, углы тайлов, отмена, undo/redo, стирание, GPU LRU и восстановление renderer.
- QA **Check canvas targets**: реальные GPU-пиксели для двух размеров и камер, HTML/offscreen replacement, detach/reattach, undo/redo; независимые частичные обновления, удаление preview и cancel/commit сравниваются с полной перерисовкой при включённом и выключенном VT.
- QA **Check execution modes**, **Run worker checks**, **Check readback queue**, **Check stroke filtering**: сохранены проверки действующего Studio.
