import { test, expect, isMobile, openStudio } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The logo layer. Two things have to be true at once: the mark is drawn as real
 * vector artwork on the canvas (not an image, not a font impression), and it is
 * an ordinary layer the visitor can pick a maker for, colour, and delete.
 */

interface PixelCount {
  accent: number;
  ink: number;
  red: number;
  blue: number;
  painted: number;
  box: { w: number; h: number };
  svgImages: number;
}

/** Paints a logo on an offscreen plate at print scale and counts its colours. */
async function emblemPixels(page: Page, emblem: Record<string, unknown>): Promise<PixelCount> {
  return page.evaluate((patch) => {
    const SF = (window as unknown as { ShutterFrame: any }).ShutterFrame;
    const spec = SF.validate({
      schema: 'shutterframe/v1',
      id: 'frame-emblem',
      name: 'Emblem probe',
      updatedAt: '2026-11-22T00:00:00.000Z',
      canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true },
      perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
      cells: [
        { x: 36, y: 96, w: 528, h: 380, radius: 4 },
        { x: 36, y: 496, w: 528, h: 380, radius: 4 },
        { x: 36, y: 896, w: 528, h: 380, radius: 4 },
        { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
      ],
      texts: [],
      emblem: {
        enabled: true, id: 'hd2lab', mono: false, x: 300, y: 1700,
        maxW: 240, maxH: 64, align: 'center', mode: 'auto', ...patch,
      },
    }).spec;

    const canvas = document.createElement('canvas');
    SF.paintTo(canvas, spec, { scale: 1 });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const box = SF.emblemBox(spec.emblem);
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const w = Math.max(1, Math.min(canvas.width - x, Math.ceil(box.w)));
    const h = Math.max(1, Math.min(canvas.height - y, Math.ceil(box.h)));
    const data = ctx.getImageData(x, y, w, h).data;
    const near = (r: number, g: number, b: number, c: number[], tol: number) =>
      Math.abs(r - c[0]) <= tol && Math.abs(g - c[1]) <= tol && Math.abs(b - c[2]) <= tol;
    let accent = 0;
    let ink = 0;
    let red = 0;
    let blue = 0;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (near(r, g, b, [244, 241, 234], 6)) continue; // bare paper
      painted += 1;
      if (near(r, g, b, [255, 130, 79], 26)) accent += 1;
      if (near(r, g, b, [26, 25, 23], 30)) ink += 1;
      if (near(r, g, b, [204, 0, 0], 30)) red += 1;
      if (near(r, g, b, [20, 40, 160], 30)) blue += 1;
    }
    return {
      accent, ink, red, blue, painted,
      box: { w: Math.round(box.w), h: Math.round(box.h) },
      svgImages: document.querySelectorAll('img[src^="data:image/svg"]').length,
    };
  }, emblem);
}

/** The properties drawer, opening it if it is closed. */
async function openProps(page: Page) {
  if ((await page.getByTestId('drawer-right').getAttribute('data-open')) !== 'true') {
    await page.getByTestId('dock-props').click();
  }
  await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'true');
}

async function stored(page: Page) {
  return page.evaluate(async () => {
    const rows = await window.ShutterFrame!.store.list();
    const spec = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return spec ? JSON.parse(JSON.stringify(spec)) : null;
  });
}

test.describe('the logo layer', () => {
  test('draws the HD2Lab mark as vector artwork in its brand colour', async ({ page }) => {
    await openStudio(page);
    const shot = await emblemPixels(page, { id: 'hd2lab', mono: false });
    expect(shot.painted, 'the mark is painted').toBeGreaterThan(120);
    expect(shot.accent, 'the dual-skew bars wear HD2Lab orange').toBeGreaterThan(40);
    expect(shot.red, 'no other maker colour leaks in').toBe(0);
    expect(shot.svgImages, 'the emblem is not an SVG image on the page').toBe(0);
    /* the mark is 172:64 — inside a 240×64 box the height binds, so the
       wordmark is not stretched wider than its own artwork */
    expect(shot.box.h).toBe(64);
    expect(shot.box.w).toBe(172);
  });

  test('All Black prints one ink instead of the brand colour', async ({ page }) => {
    await openStudio(page);
    const brand = await emblemPixels(page, { id: 'hd2lab', mono: false });
    const mono = await emblemPixels(page, { id: 'hd2lab', mono: true });
    expect(mono.accent).toBe(0);
    expect(mono.ink, 'one ink covers what the coloured mark covered').toBeGreaterThan(brand.ink * 0.5);
    expect(mono.painted).toBeGreaterThan(120);
  });

  test('a maker keeps its own colour, and mono flattens it', async ({ page }) => {
    await openStudio(page);
    const canon = await emblemPixels(page, { id: 'canon', mono: false });
    expect(canon.red, 'Canon red').toBeGreaterThan(120);
    expect(canon.accent).toBe(0);

    const flat = await emblemPixels(page, { id: 'canon', mono: true });
    expect(flat.red).toBe(0);
    expect(flat.ink).toBeGreaterThan(120);

    const samsung = await emblemPixels(page, { id: 'samsung', mono: false });
    expect(samsung.blue, 'Samsung blue').toBeGreaterThan(120);
  });

  test('the logo is a layer: pick a maker, flatten it, delete it, add it back', async ({ page }) => {
    await openStudio(page);
    /* the classic strip prints no logo, so the first step is putting one on */
    await openProps(page);
    const add = page.getByTestId('emblem-add');
    await add.scrollIntoViewIfNeeded();
    await add.click();
    /* a phone opens the properties as a sheet: close it before the next panel */
    await page.keyboard.press('Escape');

    await page.getByTestId('dock-layers').click();
    const logoRow = page.locator('.layer-row', { hasText: '로고' }).first();
    await expect(logoRow).toBeVisible();
    await expect(logoRow).toContainText('HD2Lab');

    await logoRow.click();
    await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'true');
    const type = page.getByTestId('emblem-type');
    await expect(type).toBeVisible();
    await expect(type.locator('option')).toHaveCount(11);

    await type.selectOption('sony');
    await page.getByTestId('emblem-mono').click();
    await expect
      .poll(async () => (await stored(page))?.emblem)
      .toMatchObject({ id: 'sony', mono: true, enabled: true });

    /* delete from the layer stack: the row goes, an add button takes its place */
    await page.keyboard.press('Escape');
    await page.getByTestId('dock-layers').click();
    await page.getByTestId('layer-emblem-remove').click();
    await expect(page.locator('.layer-row', { hasText: '로고' })).toHaveCount(0);
    await expect(page.getByTestId('layers-emblem-add')).toBeVisible();
    await expect.poll(async () => (await stored(page))?.emblem.enabled).toBe(false);

    await page.getByTestId('layers-emblem-add').click();
    await expect(page.locator('.layer-row', { hasText: '로고' })).toHaveCount(1);
    await expect.poll(async () => (await stored(page))?.emblem).toMatchObject({ id: 'sony', mono: true, enabled: true });
  });

  test('the frame properties carry the logo even with nothing selected', async ({ page }) => {
    await openStudio(page);
    await openProps(page);
    const add = page.getByTestId('emblem-add');
    await add.scrollIntoViewIfNeeded();
    await add.click();

    const type = page.getByTestId('emblem-type');
    await type.scrollIntoViewIfNeeded();
    await expect(type).toBeVisible();
    await type.selectOption('leica');
    await page.getByTestId('emblem-brand').click();
    await expect.poll(async () => (await stored(page))?.emblem).toMatchObject({ id: 'leica', mono: false });

    /* delete it from here too, then add it back from the properties panel */
    await page.getByTestId('emblem-delete').scrollIntoViewIfNeeded();
    await page.getByTestId('emblem-delete').click();
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.getByTestId('emblem-type')).toBeVisible();
    await expect.poll(async () => (await stored(page))?.emblem).toMatchObject({ id: 'leica', enabled: true });
  });

  test('the preset lettering is a text layer the visitor can delete', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('dock-layers').click();
    /* the title row is the 26px line; the footer is a 15px layer of its own */
    const title = page.locator('.layer-row').filter({ hasText: '26px' }).first();
    await expect(title).toBeVisible();
    await title.click();
    await expect(page.getByTestId('drawer-right')).toContainText('텍스트');
    await page.getByTestId('text-delete').scrollIntoViewIfNeeded();
    await page.getByTestId('text-delete').click();

    /* the shelf keeps the edit 550ms after the last change */
    await expect.poll(async () => (await stored(page))?.texts?.length ?? 0).toBe(3);
    const after = await stored(page);
    const words = (after?.texts ?? []).map((row: { text: string }) => row.text);
    expect(words).not.toContain('FRAMEBUILDER');
    expect(words, 'the footer line is a layer of its own').toContain('HD2LAB · FRAMEBUILDER');

    await page.keyboard.press('Escape');
    await page.getByTestId('dock-layers').click();
    await expect(page.locator('.layer-row', { hasText: 'FRAMEBUILDER' })).toHaveCount(1);
  });

  test('the studio introduces itself as FrameBuilder', async ({ page }) => {
    await openStudio(page);
    await expect(page.locator('.brand-app')).toHaveText('FrameBuilder');
    await expect(page).toHaveTitle(/^FrameBuilder — HD2Lab/);
    await expect(page.getByTestId('more-menu')).toBeVisible();
    if (isMobile(page)) await page.getByTestId('dock-save-toggle').click();
  });
});
