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

`gpu/smudgePickup.ts` хранит краску в двух GPU-банках между отпечатками: fresh canvas в текущей позиции смешивается с предыдущим pickup по Strength. Первый контакт только набирает краску; Finger Painting инициализирует её foreground. Размеры пиксельной активной области и allocation различаются: allocation растёт и переиспользуется, viewport и UV ограничены активной областью. При изменении диаметра сохраняются физические координаты краски; новый край сначала захватывается и наносится со следующего отпечатка. Begin/finish/cancel/reset сбрасывают историю pickup. Не переносить её между мазками. `smudgePickupVerification.ts` проверяет recurrence, alpha и изменение размеров на GPU.

Каждый отпечаток Smudge читает результат предыдущего. Исходные тайлы одного захвата можно рисовать пакетами, но их команды должны быть отправлены до вытеснения или перезаписи текстур. В `renderer.paintStamps` повторное копирование base ограничено областью composite scissor. Persistent scratch при первом касании тайла получает полную инициализацию, shared sampling scratch — только scissor; sampling-инструменты не используют disposable tail preview. Не объединять зависимые отпечатки без сохранения этого порядка.

На `/paint-studio-qa.html` кнопка **Measure dense smudge** чередует reference с полными mip chains и текущий путь: по одному холодному и шести тёплым изолированным проходам, размер 50, spacing 3%, pressure/scattering/count как у Wet Blender, синтетический sampled tip, фиксированные координаты и seed. Выводятся время до GPU completion (без finish), число stamps, submissions (включая finish), хеш пикселей, отдельное время finish и медианы шести тёплых проходов обоих вариантов. Хеши всех проходов, включая reference, должны совпадать. Reference не входит в медиану текущего пути. Это проверка нагрузки движка, не измерение задержки стилуса или FPS большого документа.

Замер 2026-09-08 в локальном in-app browser: 235 stamps, submissions сокращены с 1239 до 537; хеш до/после — 1536182265. После оптимизации тёплая медиана 43.9 ms; длительности заметно колеблются, поэтому универсальный коэффициент ускорения не установлен. **Check ABR presets** и **Check ABR color mixing** проверяют реальные GPU-пиксели, прозрачность, tile seams, eviction, Sample All Layers, Smooth/Classic и undo/redo.

### Длинные мазки и вытеснение

**Measure long smudge** добавляет отрисовку между пакетами по 16 точек, путь 4096 px и намеренно маленький cache на 16 tiles. Для кисти 512 px замер до/после оптимизации вытеснения составил 3400.4/1966.5 ms; 573 stamps и хеш 2602076709 совпали. Для 50 px — 820.6/802.6 ms, 5832 stamps, хеш 2578267771. Это нагрузочный тест cache, а не измерение FPS на планшете.

`tile.strokeDirty` отделяет изменённый GPU-тайл от тайла, загруженного только для sampling. Повторное вытеснение неизменённого тайла использует имеющийся snapshot без readback. Smudge/Mixer/фильтры без Dual Brush сохраняют только output: coverage у них заменяется каждым отпечатком. Обычные кисти и Dual Brush сохраняют полное накопленное состояние. Проверка **Check ABR presets** включает повторный pickup неизменённого активного тайла без новых readback, eviction и точное восстановление history.

`paintRuntime.addSamples` обрабатывает backlog по 16 точек и показывает промежуточный кадр, если работа заняла не меньше 8 ms. Это мягкий бюджет: отдельный дорогой отпечаток может занять больше времени. Точки не отбрасываются, команды end/cancel и следующие мазки остаются в исходном порядке. `workerLatency.test.ts` проверяет быстрый и медленный backlog, промежуточное представление, давление и совпадение завершённого мазка.

### Большой footprint и Smooth color

`captureRegion` берёт изменённые резидентные пиксели непосредственно из brush cache. Нерезидентные источники читает через существующий display cache, обязательно с scale=1: уменьшенные display textures нельзя использовать для sampling. Перед чтением вытесненного активного тайла ожидается его pending snapshot. Source identity и удаление display entry при рисовании защищают от устаревших пикселей. Sampling не восстанавливает ненужные mask/base и не вытесняет writable tiles. Проверка **Check ABR presets** подтверждает отсутствие readback при захвате committed-соседа с cache на один тайл.

В `canvasPickup` Smooth color читает уровень 0, поэтому не запрашивает построение mipmaps. Classic продолжает использовать mipmaps при minification. Presentation отдельно строит нужные mipmaps, когда отображает изменённые пиксели.

**Measure huge smudge** проверяет путь 8192 px с production texture budget (первоначально 128 полных tiles) и промежуточными кадрами. Локальный замер 2026-09-08 до/после: 512 px — 2231.7/1926.3 ms, хеш 3903305714; 2048 px — 9180.1/5006.5 ms, хеш 879438226. Для 2048 px submissions сократились с 210682 до 63284 при тех же 287 stamps. Тест синтетический, использует Smooth color и фиксированное давление; это не оценка FPS физического планшета.

### Пакетный захват и повторное использование bindings

`createCanvasPickup` кодирует до 32 исходных тайлов в один render pass. Каждый draw получает отдельный placement uniform из ограниченного пула. Callback `getTile` обязан вызвать `flush(texture)` до уничтожения или переиспользования источника; `flush()` отправляет весь текущий пакет безусловно. `displayCache.find/get` передают конкретную текстуру в `beforeInvalidate` перед заменой или вытеснением. Pickup отправляет пакет только если эта текстура ещё используется незавершёнными draw; cache hit, fresh upload и вытеснение постороннего entry не разрывают пакет. При ошибке lookup незавершённый pass отбрасывается, следующий capture очищает scratch.

Bindings и mask views ABR-кэша переиспользуются. `prepare` сбрасывает bindings при смене пресета, а смена координат переиспользованного scratch tile обновляет Params. Pickup texture keys слабые: cache не удерживает старые resized textures. **Check ABR presets** проверяет захват 64 тайлов через несколько циклов uniform-пула, recycling единственной source texture и восстановление после ошибки lookup.

Тот же **Measure huge smudge** после пакетирования и переиспользования ресурсов: 512 px — 1624.7 ms вместо 1926.3; 2048 px — 4254.1 ms вместо 5006.5. Submissions для 2048 px — 44043 вместо 63284. Хеши пикселей совпадают с предыдущими замерами. Результаты локальные и зависят от нагрузки системы.

### Один проход для Smudge без накопленной coverage

`abrStamps.canDrawDirect` разрешает прямое смешивание Smudge без Wet Edges и активного Dual Brush. `renderer.paintStamps` использует его только для одного primary dab: вместо очистки mask/paint, записи MRT и отдельного composite выполняется один проход по геометрии отпечатка. Копирование изменённой области в base остаётся обязательным. Зависимые отпечатки по-прежнему исполняются последовательно. Остальные кисти используют прежнее накопление coverage.

`shadeStamp` и `compositePixel` общие для обоих путей. Между ними direct shader вызывает `unpack4x8unorm(pack4x8unorm(...))` для paint и mask: это сохраняет промежуточное округление rgba8unorm. Обычный `round(x * 255) / 255` дал расхождения на один уровень цвета и не подходит для точного сравнения. Scratch textures остаются в существующем ограниченном кэше, но direct path их не читает и не записывает.

Опция renderer `directSmudge: false` оставляет multipass reference для GPU-проверок. Все три Smudge benchmark сравнивают хеши reference и direct, отдельно показывая холодные/тёплые результаты. **Check ABR presets** дополнительно сравнивает каждый пиксель при Classic/Smooth, частичной Strength, Sample All Layers, Finger Painting и Dual Brush fallback с вытеснением тайлов. Undo/redo проверяется для обоих путей.

Локальный тёплый **Measure huge smudge**, 2026-09-08: 512 px — 1624.0 → 1465.6 ms; 2048 px — 4348.4 → 4055.6 ms. Хеши остались 3903305714 и 879438226. Количество submissions не изменилось: оптимизация сокращает render passes внутри команд. У 2048 px остаются 1022 readback batches, поэтому выигрыш ограничен. Это синтетическая нагрузка до GPU completion, без finish; она не измеряет задержку стилуса на планшете.

### Отложенные mipmaps display cache и упаковка readback

`displayCache.get` загружает level-zero entry с `mipLevelReady: 0`. Smooth pickup не использует mipmaps, поэтому не строит их. Classic pickup при minification и `renderer.render` при zoom × DPR < 1 проверяют готовый префикс mip chain и достраивают нужные уровни перед чтением. Coarse entries по-прежнему создаются из готовой цепочки: для копирования уменьшенного уровня mipmaps нужны сразу. **Check ABR presets** проверяет checkerboard после Smooth pickup, последующий Classic pickup, уменьшенное отображение существующего full-resolution entry и холодного coarse entry.

`packTile` сначала собирает до 1024 длин RGBA-runs. Для обычных sparse tiles затем выделяет ровно размер пакета; полностью пустому тайлу нужен пакет в 8 bytes, полностью плотный возвращается без временного pixel buffer. Если runs больше, оставшаяся часть кодируется прямо в ограниченный TILE_BYTES buffer. Это ограничивает затраты на metadata у сильно фрагментированных кистей. Формат пакетов, определение пустого RGBA, исходные данные и политика возврата dense bytes не меняются. Readback queue по-прежнему отделяет возвращённый raw view от mapped buffer.

После обеих оптимизаций **Measure huge smudge**, локальные тёплые замеры 2026-09-08: 512 px — 1399.7 ms против 1465.6 предыдущей итерации; 2048 px — 3683.9 ms против 4055.6. У 2048 px submissions снизились с 44043 до 25411, хеш остаётся 879438226. Readback batches остались 1022: уменьшены сопутствующие GPU-команды и CPU allocations, а не число вытеснений. Замеры между запусками зависят от нагрузки системы.

### Прозрачные источники pickup

`isEmptyPackedTile` распознаёт только валидный 8-byte пакет полностью нулевого RGBA, проверяя magic и длину empty run. Raw bytes, unloaded references и неизвестные пакеты не считаются пустыми. `captureRegion` пропускает upload/draw таких immutable nonresident sources, в том числе после загрузки из storage. Resident GPU texture всегда имеет приоритет: она может содержать новый мазок поверх пустого CPU snapshot. Пустой capture по-прежнему очищает результат.

Это исключение относится только к pickup. Нельзя аналогично пропускать прозрачный active tile при presentation: он может стирать прежние пиксели overview. **Check ABR presets** проверяет пустые packed/storage sources без display allocation, очистку предыдущего pickup и новое resident ink поверх пустого snapshot.

В 2048 px benchmark исключение пустых источников уменьшило submissions с 25411 до 25171 при прежнем хеше 879438226; выигрыш по времени мал относительно вариации запусков. **Measure huge smudge** теперь считает медиану трёх тёплых проходов. Увеличение output-only eviction batch с 16 до 32 проверено и не включено: median 3673.6 против 3760.2 ms при росте staging с 8 до 16 MiB. Меньшее число capacity waits само по себе не доказывает существенное ускорение.

### Pixel cache и временный scratch

Pixel tile владеет output/mipmaps/camera, а coverage и instance buffers живут в отдельном `createStrokeScratch`. Обычные кисти и Dual Brush закрепляют scratch за tile, поскольку их mask/dual coverage накапливается. Smudge, Blur/Sharpen и Mixer без Dual Brush используют до 32 независимых scratch slots на пакет. Перед повторным использованием slots команды обязательно отправляются; base обновляется только в scissor текущего composite. Scratch не содержит историю документа.

При стандартном бюджете sampling может держать 416 pixel tiles вместо 128 полных ABR tiles. Расчёт для texture bytes: `128 × (4/3 + 4) = 416 × 4/3 + 32 × 4`; instance buffers дополнительно уменьшаются. `cacheTiles` остаётся жёстким явным лимитом, в том числе для тестов с 1/16 slots. При переходе к sampling старый persistent scratch освобождается. Обратный переход освобождает sampling pool и сокращает cache до 128 **до** новой растеризации; на этой границе все пиксели уже committed. Cancel удаляет изменённые pixel tiles, reset/destroy освобождают pool.

Finish читает resident output порциями до 128 tiles (32 MiB staging), сразу упаковывает CPU snapshots и только затем публикует изменения. Увеличение pixel cache не должно увеличивать единичный commit buffer. `stats.gpuBytes` включает scratch textures и instance buffers; это оценка выделенных ресурсов, без точного учёта небольших uniforms, bindings и transient commit buffer.

`sharedScratch: false` сохраняет per-tile ownership для сравнения. Для сравнения scratch использовался одинаковый fused shader: холодный и три тёплых прохода, время finish отдельно, одинаковый хеш всех пикселей. Scratch и pickup batching теперь включены в обоих вариантах benchmark; сравнивается построение mip chain. **Check ABR presets** дополнительно проверяет expanded-cache → Paint → Dual Brush → cancel → resume → reset на одном renderer против per-tile reference.


Локальная медиана трёх тёплых проходов 2026-09-08, один fused shader в обоих вариантах: 2048 px — 3722.2 → 2348.8 ms до finish (−36.9%), хеш 879438226; 512 px — 1448.0 → 1423.8 ms, хеш 3903305714. Для 2048 px readback batches 1022 → 542, submissions с finish 25171 → 15262, оценка allocated GPU resources 293.7 → 272.2 MiB. Для 512 px память 190.0 → 134.4 MiB. Finish отдельно: медианы около 112 → 136 ms и 22 → 54 ms соответственно: больше output остаётся resident до конца мазка. Это синтетическая GPU-нагрузка, не измерение задержки стилуса.

### Отправка pickup batch только перед инвалидированием его источников

`createCanvasPickup` удерживает Set источников только для текущего пакета (до 32 draws). `flush(source)` проверяет этот Set, а после submission очищает его вместе с индексом uniform slots. При реальном recycling используемой текстуры flush остаётся обязательным. Замена версии/coarse entry и LRU eviction в `displayCache` сообщают идентичность уничтожаемой texture до освобождения GPU resources. Await загрузки snapshot не требует submission, поскольку не меняет уже закодированные источники.

`batchPickupUploads: false` включает прежнюю eager-политику для сравнения. **Check ABR presets** проверяет 64 разноцветных тайла, два цикла uniform-пула: уведомления о посторонней texture дают ровно 2 submissions, перезапись единственного используемого источника — 64, пиксели в обоих случаях точные. Ошибка lookup не мешает следующему capture.

Локальные медианы трёх тёплых **Measure huge smudge**, 2026-09-08: 2048 px — 2499.5 → 2295.7 ms (−8.2% времени до finish), submissions 15262 → 14398, хеш 879438226. GPU memory estimate остаётся 272.2 MiB, readbacks — 542. Для 512 px 1512.9 → 1492.0 ms и всего 3 исключённых submissions: заметного ускорения в этой нагрузке нет. Это синтетические desktop-замеры с неизменным quality/spacing, не задержка реального стилуса.

### Уровни mip chain по масштабу представления

`mipLevelReady` обозначает последний актуальный уровень, начиная с level zero. Каждая запись output, повторное использование pixel slot и обновление disposable tail сбрасывают его в 0. `ensureMipmaps` достраивает только недостающий суффикс через `generateMipmaps(base, count)`, где count включает исходный уровень. Display-cache coarse entries уже имеют полный корректный префикс относительно своего уменьшенного размера.

Presentation вычисляет LOD из реальной ширины texture и zoom × DPR, с одним дополнительным уровнем для trilinear filtering и округления viewport. Classic minified pickup по-прежнему требует полный префикс; Smooth читает только level zero. Холодные coarse entries сохраняют прежний путь подготовки, а persisted overview pyramid не меняется.

`adaptiveMipmaps: false` включает полную цепочку для GPU comparison. Performance QA чередует reference/current на каждом повторении, чтобы не сравнивать два длинных раздельных временных окна. **Check ABR presets** сравнивает полные RGBA frames обоих вариантов при zoom 4–130%, rotation/mirror, дробном DPR, рисунке поверх high-frequency/translucent sources, live tails, commit/reset и смене coarse cache на более подробный. Все байты должны совпадать. В TypeGPU 0.11.4 каждый генерируемый уровень вызывает отдельный blit/submission; ограничение цепочки сокращает и passes, и submissions.

Чередующийся локальный замер 2026-09-08, медиана трёх тёплых проходов при 25% zoom: 512 px — 1455.5 → 826.2 ms (−43.2% времени рисования), submissions 34167 → 14732; 2048 px — 2340.5 → 2236.1 ms (−4.5%), submissions 14398 → 7718. Хеши 3903305714/879438226 и GPU memory estimates не изменились. У 2048 px остаётся 542 readback batches, что ограничивает выигрыш. Первый раздельный прогон имел большие timing outliers; для оценки используются interleaved results, а не завышенное сравнение из того прогона. Время finish измеряется отдельно; это synthetic desktop workload, не stylus latency.

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

### Пакетная генерация mipmaps

`gpu/tileMipmaps.ts` заменяет горячие вызовы `texture.generateMipmaps()` для raster tiles и coarse display cache. В TypeGPU 0.11.4 штатный helper создаёт pipeline, views, bindings и отдельный submit для каждого уровня. Наш helper переиспользует pipeline и views/bindings каждого texture/mip, затем отправляет всю цепочку одним command buffer. Формат и фильтрация сохранены: RGBA8, premultiplied sRGB values, linear sampler. Source writes должны быть отправлены до вызова. Helper не владеет texture; ссылки на уровни находятся в WeakMap.

`canvasPickup` передаёт источникам максимальный необходимый mip по отношению world footprint к размерам pickup texture. Classic использует `ceil(log2(maxRatio)) + 1`, не более 8; Smooth остаётся на level zero. Любое изменение level zero сбрасывает `mipLevelReady`. Нельзя отмечать всю цепочку готовой после частичного обновления.

`Measure batched mipmaps` и `Measure Classic smudge` на `/paint-studio-qa.html` чередуют старый и новый пути с одинаковыми исходными пикселями, dab seed, cache и camera. Оба сохраняют каждый отпечаток. Проверяется hash всех сохранённых пикселей. `Check ABR presets` дополнительно сравнивает кадры при zoom/rotation/edit и fractional/non-square pickup после live edits с полными исходными mip chains.

Замер 2026-09-08 в локальном in-app browser, путь 8192 px, медиана трёх тёплых запусков, без finish:

| Mixing | Brush | До | После | Submissions до → после |
| --- | ---: | ---: | ---: | ---: |
| Classic | 512 px | 1049.9 ms | 879.1 ms | 16048 → 9551 |
| Classic | 2048 px | 9466.7 ms | 2682.7 ms | 248165 → 34833 |
| Smooth | 512 px | 943.7 ms | 819.1 ms | 16048 → 9551 |
| Smooth | 2048 px | 1661.5 ms | 1452.2 ms | 17726 → 8514 |

Smooth замерен после batching; последующее ограничение Classic pickup levels не затрагивает его путь. Hash каждого сравнения совпал. Submissions включают finish, время в таблице — нет. Это локальный синтетический stress test, а не измерение скорости Photoshop или задержки стилуса на планшете.

### Промежуточные кадры внутри pointer segment

`onPaintProgress` вызывается renderer только после полного Smudge/Mixer/Filter dab и отправки всех его GPU writes. Runtime проверяет общий бюджет 8 ms после предыдущего presentation и при необходимости вызывает `draw()` напрямую. Нельзя enqueue такого draw за текущим paint: он дождётся всего backlog. Callback может render/present, но не paint/finish/cancel/reset. Дабы и input/end/cancel сохраняют порядок. 8 ms — мягкий бюджет, один дорогой dab и само отображение могут занять больше времени.

Проверка после каждых 16 samples сохраняется для остальных движков. Она не покрывала sparse input: один segment может породить сотни dabs. Теперь завершения всего segment для presentation ждать не требуется. `workerLatency.test.ts` проверяет кадры внутри segment и queued release; GPU **Check ABR presets** сравнивает полные pixels/history с промежуточными кадрами и без них, Classic/Smooth и cache на один tile.

**Measure Smudge responsiveness** использует один segment 8192 px и проверяет совпадение сохранённых pixels. Локальный тёплый замер 2026-09-08: 512 px — первый завершённый GPU-кадр 523.3 → 23.5 ms, максимальный интервал после включения progress 25.1 ms; 2048 px — 2341.1 → 63.5 ms, максимальный интервал 63.5 ms. Дополнительные кадры увеличили суммарное время с 523.3 до 605.5 ms и с 2341.1 до 2681.7 ms. Это устранение долгого отсутствия промежуточных кадров, не ускорение throughput и не измерение физической задержки стилуса. В production запросы progress ограничиваются общим runtime clock; QA повторяет этот бюджет без worker transport.


### Smudge submissions per dab

Smudge now lends one `commandBatch` to single-layer canvas pickup, persistent carry, and tile deposit. The normal resident case submits once per dab instead of three times. It still flushes before placement/scratch slot reuse, resident eviction/readback, or removal of a borrowed display-cache texture. Sample All Layers retains its layer-by-layer pickup submissions. The first pickup-only dab also flushes, and progress callbacks run only after the batch is submitted. A single-dab reference submits here. The bounded multi-dab path below reserves separate parameter/scratch slots.

`batchSmudgePasses: false` is the verification reference. **Measure Smudge submission batching** compares both paths with identical sampling, mipmaps, presentation, and full saved-pixel hashes. In local Chrome on port 3125, a 4096 px Smooth-color stroke with Wet Blender's spacing/scattering produced these warm medians (three runs; isolated synthetic tip, excludes finish):

| Brush size | Separate submissions | Batched submissions | Submissions including finish |
| --- | ---: | ---: | ---: |
| 50 px | 3391.6 ms | 1478.4 ms | 29014 → 9987 |
| 512 px | 799.2 ms | 695.7 ms | 4754 → 2892 |
| 2048 px | 1293.1 ms | 1250.6 ms | 4359 → 3904 |

All hashes matched. The largest footprint remains mostly pixel/cache work; this change chiefly improves long paths with many small dabs. These timings do not measure physical input latency or Photoshop speed. **Check ABR presets** compares separate/multipass against batched/fused Smudge with full pixel equality, Classic/Smooth, Sample All Layers, Finger Painting, Dual Brush, one-tile eviction, and undo/redo.


### Bounded batches of Smudge dabs

`batchSmudgeDabs` defaults to true. Smudge retains commands for at most eight deposited dabs, checks an 8 ms encoding budget, and submits before returning from `paint`. Progress callbacks run only after submission. Dabs remain ordered and are never dropped. Footprints with a circumscribed radius above 64 document pixels flush before and after the dab: cross-dab batching did not consistently improve larger footprints.

`commandSlots` reserves uniforms and scratch against a batch's submission version. Canvas pickup has 32 placement slots, carry has eight parameter slots, and destination scratch retains its existing maximum of 32 tiles. Flushes from any pool, cache eviction, mip generation, or presentation invalidate every pool's prior cursor. End open render passes before flushing. Scratch resize, mixing-mode changes, and independent all-layer compositing also submit pending readers/writers first. GPU textures may be reused by subsequent encoded passes, but their uniforms must not be overwritten until submission.

**Measure Smudge multi-dab batching** compares this against one submission per dab, with equal saved-pixel hashes. In local Chrome, 4096 px Smooth-color path with the synthetic Wet Blender workload, three warm runs: 50 px median 1504.9 → 849.5 ms, 10001 → 2141 submissions including finish. The output contained the same 9514 dabs. Scratch grew from 2 to 16 tiles in this case (reported GPU memory 10.3 → 25.4 MiB); allocation stays within the existing fixed budget. Large 512/2048 px cases use the same submission counts on both paths; timing differences there are not evidence of this optimization helping.

**Check ABR presets** includes dense output from sparse input with changing pressure, bank resize, Classic/Smooth, current/all layers, Finger Painting, Dual Brush, progress frames, 1/8-tile caches, and exact undo/redo. It compares full tile bytes against the single-dab reference. This is a throughput optimization; the benchmark does not measure physical stylus latency.


### Real-preset performance baseline

**Measure original Wet Blender** loads `megapack.abr` through the existing parser and snapshots the actual Wet Blender settings, primary tip and auxiliary resources through `viewerBrush`. It runs isolated 4096 px paths at 50/512/2048 px, mouse pressure 1 and Smooth mixing. Preset loading is outside the timer. Repeated runs must produce the same full saved-pixel hash. This complements the synthetic dense-tip benchmark; its absolute times are not directly comparable because stamp coverage and pressure differ.

Two further experiments were discarded after alternating reference/candidate GPU runs with this preset (three warm runs each). Zero-coverage early return showed inconsistent gains and was slower at 50/512 px in that run. Cached render bundles changed median 50 px time from 877.7 to 892.8 ms, 512 px from 781.9 to 764.8 ms, and 2048 px from 1673.1 to 1665.4 ms. Both preserved pixel hashes, but neither established a worthwhile speedup on this Chrome device. No shader shortcut, bundle cache or experiment flag remains in the production renderer. Future optimizations need a fresh measured bottleneck; fewer API calls alone are not proof of faster strokes.
