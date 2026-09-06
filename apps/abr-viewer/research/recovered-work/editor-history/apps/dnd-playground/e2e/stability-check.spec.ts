import { test, expect } from '@playwright/test';

test('drag via dispatchEvent', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-block-type="brush"]');
  await page.waitForTimeout(500);

  // Use evaluate to dispatch pointer events directly
  const result = await page.evaluate(async () => {
    const brushEl = document.querySelector('[data-block-type="brush"]')!;
    // The solidnest-block wrapper (parent of the inner div containing the brush) handles pointerdown
    // Walk up to find the element with onPointerDown — it's the block wrapper with data-kind="block"
    const blockWrapper = brushEl.closest('[data-kind="block"]') || brushEl.parentElement?.parentElement;
    if (!blockWrapper) return { error: 'No block wrapper found' };
    
    const rect = brushEl.getBoundingClientRect();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    // Simulate full pointer sequence
    blockWrapper.dispatchEvent(new PointerEvent('pointerdown', { 
      clientX: cx, clientY: cy, bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse'
    }));

    await new Promise(r => setTimeout(r, 50));

    // pointermove on document (the handler is on document)
    for (let i = 1; i <= 10; i++) {
      document.dispatchEvent(new MouseEvent('pointermove', { 
        clientX: cx, clientY: cy + i * 5, bubbles: true 
      }));
      await new Promise(r => setTimeout(r, 10));
    }

    await new Promise(r => setTimeout(r, 100));

    // Check for drag ghost
    const ghost = document.querySelector('div[style*="position: fixed"][style*="z-index: 10000"]');
    
    // Also check the Last: event
    const lastEl = document.querySelector('span.ml-auto.font-mono');
    
    // pointerup
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy + 50, bubbles: true }));

    return { 
      hasGhost: ghost !== null, 
      lastEvent: lastEl?.textContent ?? 'n/a',
      wrapperTag: blockWrapper.tagName,
      wrapperKind: blockWrapper.getAttribute('data-kind')
    };
  });

  console.log('Drag result:', JSON.stringify(result));
});
