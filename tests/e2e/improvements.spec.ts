import type { Page } from '@playwright/test';
import { test, expect, isMobile, openStudio } from './fixtures';

/**
 * The seven changes of 2026-11-22, each measured where a visitor would feel it:
 * the tab icon, the paper under the photographs, a long press on a phone, the
 * delete that empties one cut, the arrow keys, the sheet a double click opens,
 * and the two doors in the save dock that must never be mistaken for each other.
 */

const MARK_ONE = 'M13.000 18.714L37.000 6.714L37.000 43.986L13.000 55.986ZM17.000 21.186L33.000 13.186L33.000 41.514L17.000 49.514Z';

async function stored(page: Page) {
  return page.evaluate(async () => {
    const rows = await window.ShutterFrame!.store.list();
    const spec = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return spec ? JSON.parse(JSON.stringify(spec)) : null;
  });
}

/** The plate's painted box, read from the pixels the canvas actually holds. */
async function plateBox(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = W / Math.max(1, rect.width);
    return { x: rect.x + x0 / dpr, y: rect.y + y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr };
  });
}

/** Pixels on the page where a design coordinate lands. */
async function at(page: Page, designX: number, designY: number) {
  const [box, design] = await Promise.all([
    plateBox(page),
    page.evaluate(() => {
      const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
      return { w: 600, h: 1800, rect: canvas.getBoundingClientRect().width };
    }),
  ]);
  return { x: box.x + (designX / design.w) * box.w, y: box.y + (designY / design.h) * box.h };
}

async function selectFirstCut(page: Page) {
  const centre = await at(page, 300, 286);
  await page.mouse.click(centre.x, centre.y);
  await expect(page.getByTestId('context-bar')).toBeVisible();
}

async function openFirstCutSheet(page: Page) {
  const centre = await at(page, 300, 286);
  if (isMobile(page)) {
    await page.touchscreen.tap(centre.x, centre.y);
    await page.touchscreen.tap(centre.x, centre.y);
  } else {
    await page.mouse.dblclick(centre.x, centre.y);
  }
  await expect(page.getByTestId('slot-sheet')).toBeVisible();
}

test.describe('the icon a tab wears', () => {
  test('serves the redrawn mark and asks for it with a cache buster', async ({ page }) => {
    const svg = await page.request.get('/PKPilot0015/favicon.svg');
    expect(svg.status()).toBe(200);
    expect(await svg.text()).toContain(MARK_ONE);
    for (const file of ['favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon.ico']) {
      const response = await page.request.get(`/PKPilot0015/${file}`);
      expect(response.status(), file).toBe(200);
    }
    const html = await (await page.request.get('/PKPilot0015/')).text();
    for (const file of ['favicon.ico', 'favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png']) {
      expect(html, file).toContain(`${file}?v=20261122-icons`);
    }
  });
});

test.describe('the paper under the photographs', () => {
  test('opens on matte cotton, paints grain, and lets it be changed or switched off', async ({ page }) => {
    await openStudio(page);
    /* the frame on screen is not on the shelf until the first edit, so the
       default paper is read where the visitor reads it: the properties row */
    const textured = await page.locator('canvas.stage-canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    await page.getByTestId('dock-props').click();
    await expect(page.getByTestId('texture-cotton')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('texture-strength')).toHaveValue('55');

    const archive = page.getByTestId('texture-archive');
    await archive.scrollIntoViewIfNeeded();
    await archive.click();
    await expect(archive).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await stored(page))?.canvas?.texture?.kind).toBe('archive');

    const strength = page.getByTestId('texture-strength');
    await strength.focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await stored(page))?.canvas?.texture?.strength).toBeCloseTo(0.6, 2);

    await page.getByTestId('texture-none').click();
    await expect(page.getByTestId('texture-none')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await stored(page))?.canvas?.texture?.kind).toBe('none');
    await page.waitForTimeout(120);
    const flat = await page.locator('canvas.stage-canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    expect(flat, 'the grain is really painted').not.toBe(textured);
  });
});

test.describe('a long press on the plate', () => {
  test('never raises the phone selection magnifier or a copy sheet', async ({ page }) => {
    await openStudio(page);
    const style = await page.locator('canvas.stage-canvas').evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        select: computed.userSelect || (computed as unknown as { webkitUserSelect?: string }).webkitUserSelect,
        touch: computed.touchAction,
      };
    });
    expect(style.select).toBe('none');
    expect(style.touch).toBe('none');

    /* -webkit-touch-callout is Safari's own property; Chromium drops it from
       the computed style, so the stylesheet that ships is what has to say it */
    const href = await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
    const css = await (await page.request.get(href!)).text();
    expect(css, 'the touch callout rule ships with the app').toContain('-webkit-touch-callout');
    expect(css).toContain('-webkit-user-select');

    const prevented = await page.locator('canvas.stage-canvas').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      return !el.dispatchEvent(event);
    });
    expect(prevented, 'the canvas swallows its context menu').toBe(true);
  });
});

test.describe('one cut at a time', () => {
  test('empties a cut from the compact bar', async ({ page }) => {
    await openStudio(page);
    await selectFirstCut(page);
    await page.getByTestId('context-clear-photo').click();
    await expect(page.locator('.toast')).toContainText('사진을 지웠습니다');
    await expect(page.getByTestId('context-clear-photo')).toHaveCount(0);
    await openFirstCutSheet(page);
    await expect(page.getByTestId('slot-empty')).toBeVisible();
    await expect(page.getByTestId('slot-clear')).toHaveCount(0);
  });

  test('empties a cut from its own sheet', async ({ page }) => {
    await openStudio(page);
    await openFirstCutSheet(page);
    await expect(page.getByTestId('slot-clear')).toBeVisible();
    await page.getByTestId('slot-clear').click();
    await expect(page.getByTestId('slot-empty')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('사진을 지웠습니다');
  });
});

test.describe('the keyboard on the plate', () => {
  test('the arrows turn and size the selected cut', async ({ page }) => {
    await openStudio(page);
    await selectFirstCut(page);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.rotation).toBe(2);

    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.rotation).toBe(-3);

    const width = (await stored(page))!.cells[0].w as number;
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.w).toBe(Math.round(width * 1.02));
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.w).toBe(Math.round(Math.round(width * 1.02) * 0.9));

    /* a caret in a field keeps its own arrows */
    const rotation = (await stored(page))!.cells[0].rotation as number;
    if (!isMobile(page)) {
      const field = page.getByTestId('drawer-right').locator('.rail-section').first().locator('input[type="number"]').first();
      await field.click();
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(900);
      expect((await stored(page))!.cells[0].rotation).toBe(rotation);
    }
  });
});

test.describe('the sheet a cut opens', () => {
  test('opens on a double click with photo, size and angle', async ({ page }) => {
    await openStudio(page);
    await openFirstCutSheet(page);
    await expect(page.getByTestId('slot-width')).toBeVisible();
    await expect(page.getByTestId('slot-height')).toBeVisible();
    await expect(page.getByTestId('slot-rotation')).toBeVisible();
    await expect(page.getByTestId('slot-corner')).toBeVisible();

    const sheet = page.getByTestId('slot-sheet');
    await expect(sheet.locator('.modal-title')).toContainText('슬롯 01');

    /* width grows, the ratio keeps the height with it */
    const beforeW = Number(await page.getByTestId('slot-width').inputValue());
    const beforeH = Number(await page.getByTestId('slot-height').inputValue());
    await page.getByTestId('slot-width').fill(String(beforeW + 40));
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.w).toBe(beforeW + 40);
    const after = (await stored(page))!.cells[0];
    expect(after.h).toBeGreaterThan(beforeH);

    /* the angle is the same value the properties drawer shows */
    await page.getByTestId('slot-rotation').fill('12');
    await expect.poll(async () => (await stored(page))?.cells?.[0]?.rotation).toBe(12);

    await page.getByTestId('slot-done').click();
    await expect(sheet).toHaveCount(0);
    await page.getByTestId('dock-props').click();
    await expect(page.getByTestId('drawer-right')).toContainText('슬롯 01');
  });

  test('double tap opens it on a phone', async ({ page }) => {
    test.skip(!isMobile(page), 'a phone gesture');
    await openStudio(page);
    await openFirstCutSheet(page);
    await expect(page.getByTestId('slot-done')).toBeVisible();
  });
});

test.describe('the two doors in the save dock', () => {
  test('name Shutterplate and CinePlate with their own work and marks', async ({ page }) => {
    await openStudio(page);
    if (isMobile(page)) await page.getByTestId('dock-save-toggle').click();

    const print = page.getByTestId('dock-shutterplate');
    const cine = page.getByTestId('dock-cineplate');
    await expect(print).toBeVisible();
    await expect(cine).toBeVisible();
    await expect(print).toContainText('Shutterplate');
    await expect(print).toContainText('4컷 인화');
    await expect(cine).toContainText('CinePlate');
    await expect(cine).toContainText('필름 · 영상');
    await expect(print).toHaveAttribute('data-app', 'shutterplate');
    await expect(cine).toHaveAttribute('data-app', 'cineplate');

    const printIcon = await print.locator('.app-icon path').first().getAttribute('d');
    const cineIcon = await cine.locator('.app-icon path').first().getAttribute('d');
    expect(printIcon).not.toBe(cineIcon);

    /* the old name is gone from every surface */
    await page.getByTestId('more-menu').click();
    const menu = await page.locator('.nav-pop').innerText();
    expect(menu).toContain('CinePlate');
    expect(menu).not.toContain('Nordlys');
    await page.keyboard.press('Escape');

    await page.getByTestId('more-menu').click();
    await page.getByRole('menuitem', { name: /도움말/ }).click();
    const help = await page.getByTestId('help-modal').innerText();
    expect(help).toContain('CinePlate');
    expect(help).not.toContain('Nordlys');
  });
});

test.describe('a phone at 390 × 844', () => {
  test('draws the plate, keeps every control in reach and no error', async ({ page }) => {
    test.skip(!isMobile(page), 'a phone viewport');
    await openStudio(page);
    await expect(page.locator('canvas.stage-canvas')).toBeVisible();
    const box = await page.locator('canvas.stage-canvas').boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('dock-save-toggle').click();
    const items = page.locator('.dock-save-items');
    await expect(items).toBeVisible();
    const print = await page.getByTestId('dock-shutterplate').boundingBox();
    const cine = await page.getByTestId('dock-cineplate').boundingBox();
    expect(print!.x).toBeGreaterThanOrEqual(0);
    expect(print!.x + print!.width).toBeLessThanOrEqual(390);
    expect(cine!.x + cine!.width).toBeLessThanOrEqual(390);
    /* both names are readable on a phone, not just an icon */
    await expect(page.getByTestId('dock-shutterplate').locator('.app-label')).toBeVisible();
    await expect(page.getByTestId('dock-cineplate').locator('.app-label')).toBeVisible();
  });
});
