# Сопровождение Paint Studio

## Где менять поведение

| Задача                                   | Основной модуль                                              | Проверка                                                    |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| JSX-сборка, зависимости и сменные движки | `composition/StudioApplication.tsx`, `composition/README.md` | `PaintApplication.test.tsx`, Check execution modes          |
| Canvas-цели и их lifecycle               | `composition/CanvasTarget.tsx`, `gpu/renderer.ts`            | Check canvas targets                                        |
| Импорт и выбор ABR-наконечника | `brushLibrary/` | decoder/controller/import lifecycle tests; import → draw → main/worker switch |
| Панели, клавиатура, состояние интерфейса | `PaintStudio.tsx`, `createPaintSession.ts`                   | `test:studio-ui`                                            |
| Полный экран                             | `FullscreenButton.tsx`                                       | вход/выход, внешний Escape, отказ, двойное нажатие, unmount |
| Жесты puck в 2D и 3D                     | `packages/navigation-puck/src/controller.ts`                 | тесты пакета и DOM-тест puck                                |
| Сэмплы пера и форма мазка                | `input.ts`, `smoothStroke.ts`, `brush.ts`                    | node-тесты геометрии, GPU-проверка кисти                    |
| Порядок команд, commit и автосохранение  | `paintRuntime.ts`                                            | `workerRecovery.test.ts`, Run worker checks                 |
| Тайлы, undo/redo, версия документа       | `document.ts`                                                | `core.test.ts`, экспорт/восстановление                      |
| Транзакции IndexedDB и сборка мусора     | `tileStore.ts`                                               | Run streaming checks, Run worker checks                     |
| Растеризация и вытеснение GPU-тайлов     | `gpu/renderer.ts`, `gpu/readbackQueue.ts`                    | Check readback queue, Check brush batching                  |
| Обзоры, LOD, отмена устаревших загрузок  | `virtualPages.ts`, `pageWork.ts`, `gpu/virtualTexture.ts`    | node-тесты страниц, Check saved low-res, Check cold zoom    |

Изменённые области каждого canvas учитываются в `gpu/viewDamage.ts`. Кадр подтверждает только свою версию изменений после успешного отображения. Проверка **Check canvas targets** сравнивает частичные обновления с полной перерисовкой, включая preview, cancel и commit с VT и без него.

## Производительность Smudge

`gpu/canvasPickup.ts` захватывает текущие пиксели для Smudge, Mixer и фильтров на GPU. Один слой без Sample All Layers сразу рисуется в итоговую текстуру; первый проход также очищает её. Пустой захват обязан очистить результат, иначе появятся пиксели предыдущего отпечатка. Для нескольких слоёв сохраняются отдельное смешивание, opacity и visibility.

Каждый отпечаток Smudge читает результат предыдущего. Отправка GPU-команд перед следующим поиском тайла защищает от вытеснения исходной текстуры и перезаписи общего uniform. В `renderer.paintStamps` повторное копирование base ограничено областью composite scissor. При первом касании тайла остаётся полная инициализация; sampling-инструменты не используют disposable tail preview. Не объединять зависимые отпечатки без сохранения этого порядка.

На `/paint-studio-qa.html` кнопка **Measure dense smudge** запускает семь изолированных проходов: размер 50, spacing 3%, pressure/scattering/count как у Wet Blender, синтетический sampled tip, фиксированные координаты и seed. Выводятся время до GPU completion (без finish), число stamps, submissions (включая finish), хеш пикселей и медиана шести тёплых проходов. Результаты проходов должны совпадать. Это проверка нагрузки движка, не измерение задержки стилуса или FPS большого документа.

Замер 2026-09-08 в локальном in-app browser: 235 stamps, submissions сокращены с 1239 до 537; хеш до/после — 1536182265. После оптимизации тёплая медиана 43.9 ms; длительности заметно колеблются, поэтому универсальный коэффициент ускорения не установлен. **Check ABR presets** и **Check ABR color mixing** проверяют реальные GPU-пиксели, прозрачность, tile seams, eviction, Sample All Layers, Smooth/Classic и undo/redo.

### Длинные мазки и вытеснение

**Measure long smudge** добавляет отрисовку между пакетами по 16 точек, путь 4096 px и намеренно маленький cache на 16 tiles. Для кисти 512 px замер до/после оптимизации вытеснения составил 3400.4/1966.5 ms; 573 stamps и хеш 2602076709 совпали. Для 50 px — 820.6/802.6 ms, 5832 stamps, хеш 2578267771. Это нагрузочный тест cache, а не измерение FPS на планшете.

`tile.strokeDirty` отделяет изменённый GPU-тайл от тайла, загруженного только для sampling. Повторное вытеснение неизменённого тайла использует имеющийся snapshot без readback. Smudge/Mixer/фильтры без Dual Brush сохраняют только output: coverage у них заменяется каждым отпечатком. Обычные кисти и Dual Brush сохраняют полное накопленное состояние. Проверка **Check ABR presets** включает повторный pickup неизменённого активного тайла без новых readback, eviction и точное восстановление history.

`paintRuntime.addSamples` обрабатывает backlog по 16 точек и показывает промежуточный кадр, если работа заняла не меньше 8 ms. Это мягкий бюджет: отдельный дорогой отпечаток может занять больше времени. Точки не отбрасываются, команды end/cancel и следующие мазки остаются в исходном порядке. `workerLatency.test.ts` проверяет быстрый и медленный backlog, промежуточное представление, давление и совпадение завершённого мазка.

### Большой footprint и Smooth color

`captureRegion` берёт изменённые резидентные пиксели непосредственно из brush cache. Нерезидентные источники читает через существующий display cache, обязательно с scale=1: уменьшенные display textures нельзя использовать для sampling. Перед чтением вытесненного активного тайла ожидается его pending snapshot. Source identity и удаление display entry при рисовании защищают от устаревших пикселей. Sampling не восстанавливает ненужные mask/base и не вытесняет writable tiles. Проверка **Check ABR presets** подтверждает отсутствие readback при захвате committed-соседа с cache на один тайл.

В `canvasPickup` Smooth color читает уровень 0, поэтому не запрашивает построение mipmaps. Classic продолжает использовать mipmaps при minification. Presentation отдельно строит нужные mipmaps, когда отображает изменённые пиксели.

**Measure huge smudge** проверяет путь 8192 px с production cache на 128 tiles и промежуточными кадрами. Локальный замер 2026-09-08 до/после: 512 px — 2231.7/1926.3 ms, хеш 3903305714; 2048 px — 9180.1/5006.5 ms, хеш 879438226. Для 2048 px submissions сократились с 210682 до 63284 при тех же 287 stamps. Тест синтетический, использует Smooth color и фиксированное давление; это не оценка FPS физического планшета.

## Контракт ошибок

`asyncResult.ts` определяет `Result<T, E>` и `attempt(action)`. На успехе доступны `ok: true` и `value`, на ошибке `ok: false` и `error`. `attempt` вызывает операцию сразу, до первого ожидания. Это сохраняет активацию пользователя для fullscreen и порядок отправки GPU-команд. Ошибки внешних API имеют тип `unknown`; существующий `Error` сохраняется, другие значения становятся `Error` с исходным `cause`.

`createTaskQueue().run(action)` возвращает результат каждой операции и запускает следующую после любого исхода предыдущей. Вызывающий код отвечает за обработку `error`. `drain()` фиксирует хвост на момент вызова и возвращает его результат, а не стирает ошибку. Этот модуль используется очередью команд worker и очередью транзакций хранилища.

GPU-readback возвращает `ready: Promise<Result<Uint8Array[]>>`. Результат активного тайла хранится до его проверки при повторном рисовании, отображении или завершении мазка. Результат отменённого поколения не публикуется. Освобождение staging-буфера выполняется в `finally` и проверяет поколение владельца.

Некоторые существующие интерфейсы, включая растеризацию и запись checkpoint, пока возвращают обычные отклоняемые Promise. `unwrapResult` обозначает переход к этому контракту и может бросить исходную ошибку. Не использовать его там, где вызывающий код должен выбрать способ восстановления. TypeScript не проверяет список исключений функции: `Result` делает проверяемыми именно те исходы, которые входят в возвращаемый тип.

Отмена подготовки обзорной страницы обозначается `ObsoletePageError`. Проверять её через `instanceof`, а не через текст сообщения. Ошибка диска с похожим текстом не является отменой. Fullscreen использует отдельный `FullscreenError`: неподдерживаемый API, занятый запрос, уничтоженный компонент или отказ браузера.

Пустые `catch` запрещены по соглашению. В обработчике должно быть одно из действий: вернуть типизированный результат, сообщить ошибку владельцу операции, освободить ресурсы и пробросить ошибку, либо явно обработать ожидаемую отмену. `finally` отвечает за освобождение ресурсов и не должен подменять результат операции.

## Что необходимо сохранять при изменениях

- GPU-команды копирования отправляются до переиспользования исходных текстур. Mapped-пиксели копируются или упаковываются до `unmap`.
- Очередь readback ограничена двумя буферами. Заполнение очереди создаёт ожидание, а не новые неограниченные выделения памяти.
- Активный preview не является committed-документом. Ошибка завершения сбрасывает preview и sampler; ранее завершённые мазки остаются доступны.
- Dirty-тайлы хранилища закреплены в RAM до успешной транзакции. Не очищать dirty-флаг в обработчике ошибки.
- High-res и готовые low-res сохраняются согласованным checkpoint. Фоновое сохранение не должно заменять более новые живые пиксели.
- В Solid 2 setup внутри `onSettled` возвращает teardown. Primitives, создающие `onCleanup` или реактивные узлы, объявляются на уровне компонента.
- Решения внутри одного события нельзя основывать на чтении сигнала сразу после записи. Для блокировки двойного запроса используется синхронное состояние; для отображения состояния используется сигнал.

## Проверка изменения

Из корня репозитория:

```sh
pnpm --filter @app-game/paint typecheck:studio
pnpm --filter @app-game/paint test:studio
pnpm --filter @app-game/paint test:studio-ui
pnpm --filter @app-game/paint build:studio
```

Для GPU и IndexedDB использовать `http://127.0.0.1:3121/paint-studio-qa.html`. QA создаёт изолированные документы; не рисовать тестовые мазки в пользовательском документе на `localhost`. После изменений в очередях обязательны Check readback queue и Run worker checks. После изменений транзакций дополнительно Run streaming checks.

DOM-тесты fullscreen моделируют браузерный API. Реальный запрос зависит от поддержки браузером, политики документа и активации пользователя. Кнопка показывает фактическое `fullscreenElement` через `fullscreenchange`; обычный браузерный полноэкранный режим F11 этим API не управляется.

### Brush resource ownership

`composition/brushResources.ts` owns decoded r8 coverage per runtime. Uploads copy input bytes; engine scopes borrow immutable-by-contract pixels and pin entries. `resourceSession.ts` releases pins on finish/cancel and factory/input/finish failures. On input failure the command runtime drops the closed session immediately, so the next pen-down can start normally. Resource command failures use correlated `brush-resources` results and leave document/save state untouched.

Imports and renderer recovery retain the brush cache. Runtime teardown clears it. `createPaintSession` reuploads the selected tip before enabling input on a replacement runtime; the cache is neither document persistence nor a GPU texture cache. Keep ABR decoding outside the cache, and resolve every required texture ID before creating transient GPU stroke state. Run resource model tests, composition UI tests, worker recovery tests, execution-mode QA and worker QA after changing this lifetime.

`composition/texturedBrushEngine.ts` maps brush size to the circumscribed radius used by raster tile binning. The GPU shader restores native tip half-extents and inverse rotation. Keep that conversion paired; using the unscaled round radius clips rectangular corners. Committed and display-only dabs use the same textured pipeline and stroke mask compositing. `gpu/texturedStamps.ts` owns lazy device-local mip textures, a 64 MiB/256-entry LRU and weak CPU-resource lookup. Call prepare only between strokes. Run Check textured brushes and both execution-mode/worker checks after changing this path.

### Embedded ABR Viewer

The experimental ABR Brush opens `AbrViewerDialog`, which lazily mounts `@app-game/abr-viewer/editor`. The optional `App.onUseBrush` callback is the embedding contract; it owns no Paint imports. The dialog remains mounted while closed to retain the Viewer workspace. `viewerBrush` snapshots the full preset, primary/dual tips and embedded texture. `createPaintSession` keeps round/ABR profiles separately and waits for the resource upload before changing the selected brush. The shared `@app-game/abr-brush` sampler drives `abrBrushEngine` and the tiled GPU rasterizer. Preset smoothing replaces the round processor; None bypasses it. See `packages/abr-brush/README.md` for implemented controls and unresolved Photoshop differences. ABR eviction and preview copies must preserve primary color and secondary coverage alongside the normal mask; run `verifyAbrBrush` after changing that lifecycle.

Studio's standalone build needs UnoCSS for the embedded editor. Full Viewer import/export and GPU previews remain in their original modules. The compact picker/import worker below remains an alternative integration, not the active ABR Brush UI.

### Compact ABR import ownership

`brushLibrary/createBrushLibrary.ts` owns one session library, selection and correlated CPU-resource uploads. Closing the panel preserves this owner. Unmount aborts parsing and rejects pending uploads. Mode switching is blocked during import; runtime readiness waits for the selected tip to upload again. A timed-out upload remains correlated until acknowledgement/disconnect, preventing duplicate immutable IDs on retry.

The importer uses Vite's `?worker` loader and the shared `@app-game/abr-parser/reader` export. `@solid-primitives/workers` serializes self-contained functions and does not bundle their parser imports, so it cannot replace this module worker. Abort subscription uses the installed Solid 2-compatible `makeEventListener` with an explicit disposer because import starts outside a Solid owner. The controller owns its signals and cleanup in the editor root.

Keep source and decoded limits separate: Studio accepts up to 32 MiB of source, 64 MiB of normalized coverage per library, 32 MiB per tip, 8192 pixels per side and 1000 presets. `maxDecodedBytes` is checked in the shared parser before allocation and resets per parse. Decode failure preserves the previous library. Only names, IDs and coverage leave the decoder; no Photoshop dynamics are applied. Brush libraries are not persisted across page reloads.
