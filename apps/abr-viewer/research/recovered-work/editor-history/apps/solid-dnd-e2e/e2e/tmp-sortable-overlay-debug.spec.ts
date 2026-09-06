import { expect, test } from '@playwright/test';

test('debug sortable overlay drop place lifecycle', async ({ page }) => {
  await page.goto('http://127.0.0.1:3040/sortable-overlay');
  await page.waitForLoadState('networkidle');

  const first = page.locator('[role="listbox"] > div').first();
  const box = await first.boundingBox();
  if (!box) {
    throw new Error('Could not measure first sortable item');
  }

  const container = page.locator('[role="listbox"]').first();
  console.log('containerBefore', await container.boundingBox());
  console.log('firstBox', box);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 5 });

  const immediate = await page.locator('text=dropPlace').locator('..').textContent();
  console.log('dropPlaceImmediate', immediate);

  await page.waitForTimeout(300);
  const afterWait = await page.locator('text=dropPlace').locator('..').textContent();
  console.log('dropPlaceAfterWait', afterWait);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 10 });
  const afterSecondMove = await page.locator('text=dropPlace').locator('..').textContent();
  console.log('dropPlaceAfterSecondMove', afterSecondMove);

  const snapshot = await page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    const containerRect = listbox?.getBoundingClientRect();
    const items = [...(listbox?.children ?? [])].map((element) => ({
      text: element.textContent,
      rect: element.getBoundingClientRect().toJSON?.() ?? null,
      className: (element as HTMLElement).className
    }));

    return {
      containerRect: containerRect?.toJSON?.() ?? null,
      items,
      bodyText: document.body.textContent
    };
  });

  console.log(JSON.stringify(snapshot));
  expect(snapshot.containerRect).toBeTruthy();
  await page.mouse.up();
});
