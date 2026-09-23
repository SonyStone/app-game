import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes an offline, per-document review with explicit test coverage and completed-frame timings. */
export async function writeCorpusReport(output, results) {
  const rows = results
    .map((result) => {
      const completed = result.phase === 'complete' && !result.failed && result.exit === 0;
      const previousImport = result.importVerification;
      const importVerified = previousImport?.phase === 'complete' && !previousImport.failed;
      const importStatus =
        result.importChecked === false
          ? importVerified
            ? `<a href="${result.directory}/import-verification.json">проверен отдельным запуском через интерфейс</a>; здесь повторная навигация по GDOC`
            : 'пропущен; используется готовый GDOC'
          : 'проверяется через интерфейс';
      const openMs = result.openMs ?? (importVerified ? previousImport.openMs : undefined);
      const scenarios = result.scenarios ?? [];
      const median = Math.max(0, ...scenarios.map((item) => item.completedMs.median));
      const p95 = Math.max(0, ...scenarios.map((item) => item.completedMs.p95));
      const visits = (result.pageVisits ?? []).map((item) => item.completed).sort((a, b) => a - b);
      const visitP95 = visits[Math.floor(visits.length * 0.95)] ?? 0;
      const visitMax = visits.at(-1) ?? 0;
      const captures = [
        ['opened.png', 'Открытый PDF'],
        ['overview.png', 'Общий вид'],
        ['page.png', 'Страница'],
        ['letter.png', 'Предельный зум']
      ]
        .filter(([file]) => existsSync(path.join(output, result.directory, file)))
        .map(([file, label]) => `<a href="${result.directory}/${file}">${label}</a>`)
        .join(' · ');
      const details = scenarios
        .map(
          (item) =>
            `<tr><td>${escape(item.name)}</td><td>${item.visiblePages}</td><td>${item.completedMs.median.toFixed(1)}</td><td>${item.completedMs.p95.toFixed(1)}</td><td>${item.completedMs.max.toFixed(1)}</td><td>${item.completedFramesPerSecond.toFixed(1)}</td></tr>`
        )
        .join('');
      return `<tr class="${completed ? (p95 > 33.3 ? 'slow' : 'ok') : 'failed'}"><td>${escape(result.name)}<details><summary>Подробности</summary><p>${escape(result.failed || result.phase)}</p><p>Импорт PDF: ${importStatus}. Посещение страниц: p95 ${visitP95.toFixed(1)} мс, максимум ${visitMax.toFixed(1)} мс.</p><p>${escape(result.browser || '')}; ${result.renderer?.width ?? '?'} × ${result.renderer?.height ?? '?'} физических пикселей.</p><p>${captures}</p><table><thead><tr><th>Сценарий</th><th>Видимых страниц</th><th>Медиана, мс</th><th>p95, мс</th><th>Максимум, мс</th><th>Кадров/с</th></tr></thead><tbody>${details}</tbody></table></details></td><td>${completed ? 'Пройдено' : 'Ошибка'}</td><td>${openMs === undefined ? '—' : (openMs / 1000).toFixed(1)}</td><td>${result.pageVisits?.length ?? 0} / ${result.renderer?.pages ?? '?'}</td><td>${scenarios.length ? median.toFixed(1) : '—'}</td><td>${scenarios.length ? p95.toFixed(1) : '—'}</td></tr>`;
    })
    .join('');
  await writeFile(
    path.join(output, 'index.html'),
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Проверка PDF и навигации</title><style>body{font:15px system-ui;margin:32px;max-width:1500px;background:#f5f6f8;color:#20252b}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #dde1e5;vertical-align:top}th{background:#e9edf2}summary{cursor:pointer;color:#235b95;margin-top:8px}.failed{background:#ffe3e0}.slow{background:#fff4d7}a{color:#235b95}details table{font-size:13px}p{max-width:1100px;line-height:1.5}</style><h1>Проверка PDF и навигации</h1><p>Последовательные запуски установленного Chrome. План проверки каждого файла: импорт PDF через интерфейс, колесо и перетаскивание, затем измерения сохранённого GDOC в новом браузере. Матрица включает общий вид, дальний и промежуточный масштабы, страницу, детали, предельное приближение, вращение, цикл зума и возврат. Далее проверяется каждая страница на масштабе чтения. Статус и число посещённых страниц показывают, какие проверки удалось завершить.</p><p>Время кадра включает CPU и ожидание завершения GPU. Одновременно отправляется не больше одного кадра. «Кадров/с» описывает измеренный цикл отрисовки, а не аппаратное предъявление кадров дисплеем. Медиана и p95 в общей таблице взяты из самого медленного сценария. Жёлтым отмечен p95 выше 33,3 мс. Это проверка конкретных масштабов и траекторий, а не доказательство отсутствия ошибок при любом возможном взаимодействии или полной точности PDF.</p><table><thead><tr><th>Документ</th><th>Результат</th><th>Открытие, с</th><th>Посещено страниц</th><th>Медиана кадра, мс</th><th>p95, мс</th></tr></thead><tbody>${rows}</tbody></table><p><a href="report.json">Полный JSON отчёт</a></p></html>`
  );
}

function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );
}
