import type { Page } from '@playwright/test';
import { test, expect, isMobile, openStudio } from './fixtures';

/**
 * The background crop modal shows the whole photograph, dims what will be cut
 * away, and lets the frame-locked window be moved and resized directly.
 */

const PHOTO = { w: 1200, h: 900 }; /* 4:3 landscape file in a 1:3 tall plate */
const RATIO = 600 / 1800;

async function photoBuffer(page: Page) {
  const dataUrl = await page.evaluate(({ w, h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const colours = ['#b3402f', '#2f6ba3', '#3f7a3a', '#c9a227'];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy], i) => {
      ctx.fillStyle = colours[i];
      ctx.fillRect(cx * (w / 2), cy * (h / 2), w / 2, h / 2);
    });
    return canvas.toDataURL('image/png');
  }, PHOTO);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function openCrop(page: Page) {
  await openStudio(page);
  await page.getByTestId('dock-props').click();
  const add = page.getByTestId('props-bg-add');
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await expect(page.getByTestId('bg-crop-modal')).toBeVisible();
}

async function loadPhoto(page: Page) {
  await page.locator('#bg-file').setInputFiles({
    name: 'e2e-photo.png',
    mimeType: 'image/png',
    buffer: await photoBuffer(page),
  });
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

const box = async (page: Page, testId = 'crop-box') => {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`${testId} has no box`);
  return b;
};

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
  }
  await page.mouse.up();
}

test.describe('background crop modal', () => {
  test('shows the whole photograph, dimmed outside a frame-locked window', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);

    const host = await box(page, 'crop-host');
    const stage = await box(page, 'crop-stage');
    const frame = await box(page);

    /* the photograph is contained whole: its own 4:3 is intact inside the host */
    expect(Math.abs(stage.width / stage.height - PHOTO.w / PHOTO.h)).toBeLessThan(0.02);
    expect(stage.width).toBeLessThanOrEqual(host.width + 1);
    expect(stage.height).toBeLessThanOrEqual(host.height + 1);

    /* the window is locked to the plate's 1:3 and sits inside the photograph */
    expect(Math.abs(frame.width / frame.height - RATIO)).toBeLessThan(0.02);
    expect(frame.x).toBeGreaterThanOrEqual(stage.x - 1);
    expect(frame.y).toBeGreaterThanOrEqual(stage.y - 1);
    expect(frame.x + frame.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(frame.y + frame.height).toBeLessThanOrEqual(stage.y + stage.height + 1);

    /* what gets cut away is dimmed by the veil */
    await expect(page.getByTestId('crop-veil')).toBeVisible();
    const shade = await page
      .getByTestId('crop-veil')
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shade).toContain('rgba(6, 8, 16, 0.62)');
  });

  test('the crop viewport fills the modal instead of shrinking the photo', async ({ page }) => {
    const viewport = page.viewportSize();
    await openCrop(page);
    await loadPhoto(page);
    const host = await box(page, 'crop-host');
    const narrowest = isMobile(page) ? (viewport?.width ?? 390) * 0.8 : Math.min(560, viewport?.width ?? 1440);
    expect(host.height).toBeGreaterThanOrEqual((viewport?.height ?? 900) * 0.4);
    expect(host.width).toBeGreaterThanOrEqual(narrowest);
  });

  test('세로 맞춤 · 가로 맞춤 · 가운데 place the window on the photograph', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    const stage = await box(page, 'crop-stage');

    /* shrink it first so the fits visibly do something */
    const grip = await box(page, 'crop-handle-se');
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -60, -60);

    await page.getByTestId('crop-fit-height').click();
    let frame = await box(page);
    expect(Math.abs(frame.height - stage.height)).toBeLessThan(2);
    expect(Math.abs(frame.y - stage.y)).toBeLessThan(2);
    expect(Math.abs(frame.x + frame.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(2);

    await page.getByTestId('crop-fit-width').click();
    frame = await box(page);
    expect(Math.abs(frame.height - stage.height)).toBeLessThan(2);
    expect(Math.abs(frame.y - stage.y)).toBeLessThan(2);

    /* centre moves without changing the size */
    const before = await box(page);
    const gripCenter = await box(page, 'crop-handle-nw');
    await drag(page, { x: gripCenter.x + gripCenter.width / 2, y: gripCenter.y + gripCenter.height / 2 }, 40, 40);
    const shrunk = await box(page);
    expect(shrunk.width).toBeLessThan(before.width);
    await page.getByTestId('crop-center').click();
    const centred = await box(page);
    expect(Math.abs(centred.width - shrunk.width)).toBeLessThan(2);
    expect(Math.abs(centred.height - shrunk.height)).toBeLessThan(2);
    expect(Math.abs(centred.x + centred.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(2);
    expect(Math.abs(centred.y + centred.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(2);
  });

  test('the window drags smoothly and stays inside the photograph', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    const stage = await box(page, 'crop-stage');

    const grip = await box(page, 'crop-handle-se');
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -60, -120);

    const start = await box(page);
    const centre = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    await drag(page, centre, 40, 0);
    const moved = await box(page);
    /* twelve frames of dragging 40px in total land on 40px, not thousands */
    expect(Math.abs(moved.x - start.x - 40)).toBeLessThan(2);
    expect(Math.abs(moved.y - start.y)).toBeLessThan(2);
    expect(Math.abs(moved.width - start.width)).toBeLessThan(1);
    expect(Math.abs(moved.height - start.height)).toBeLessThan(1);

    /* pushed hard against the edge it stops at the photograph, not beyond */
    await drag(page, { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 }, 2000, 2000);
    const pinned = await box(page);
    expect(pinned.x + pinned.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(pinned.y + pinned.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  });

  test('a corner handle resizes while keeping the frame ratio', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    const start = await box(page);
    const grip = await box(page, 'crop-handle-se');
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -50, -50);
    const resized = await box(page);
    expect(resized.width).toBeLessThan(start.width - 20);
    expect(Math.abs(resized.width / resized.height - RATIO)).toBeLessThan(0.02);
    /* the opposite corner held still */
    expect(Math.abs(resized.x - start.x)).toBeLessThan(2);
    expect(Math.abs(resized.y - start.y)).toBeLessThan(2);
  });

  test('applying paints the cropped background into the plate', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    await page.getByTestId('bg-apply').click();
    await expect(page.getByTestId('bg-crop-modal')).toHaveCount(0);

    /* the drawer now shows the applied background and offers a re-cut */
    await page.getByTestId('dock-props').click();
    const reCut = page.getByTestId('props-bg-cut');
    await reCut.scrollIntoViewIfNeeded();
    await expect(reCut).toBeVisible();
    const dims = await page.locator('.bg-thumb').evaluate((el) => {
      const img = el as HTMLImageElement;
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    expect(Math.abs(dims.w / dims.h - RATIO)).toBeLessThan(0.02);
  });

  test('a finger drags the window on a phone', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 1024, 'touch only');
    await openCrop(page);
    await loadPhoto(page);
    const grip = await box(page, 'crop-handle-se');
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -60, -60);

    const start = await box(page);
    const cdp = await page.context().newCDPSession(page);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 10; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 3, y, id: 1 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const moved = await box(page);
    /* ten touch frames of 3px each move the window 30px, exactly */
    expect(Math.abs(moved.x - start.x - 30)).toBeLessThan(2);
    expect(Math.abs(moved.y - start.y)).toBeLessThan(2);
    expect(Math.abs(moved.width - start.width)).toBeLessThan(1);
  });

  test('reopening shows the photograph already in the frame', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    await page.getByTestId('bg-apply').click();
    await page.getByTestId('bg-crop-modal').waitFor({ state: 'detached' });

    await page.getByTestId('dock-props').click();
    const reCut = page.getByTestId('props-bg-cut');
    await reCut.scrollIntoViewIfNeeded();
    await reCut.click();
    await expect(page.getByTestId('bg-crop-modal')).toBeVisible();
    await expect(page.getByTestId('crop-box')).toBeVisible();

    const stage = await box(page, 'crop-stage');
    const frame = await box(page);
    expect(stage.width).toBeGreaterThan(0);
    expect(Math.abs(frame.width / frame.height - RATIO)).toBeLessThan(0.02);
    await expect(page.locator('.crop-name')).toContainText('현재 배경');
  });

  test('both languages name the three fits', async ({ page }) => {
    await openCrop(page);
    await loadPhoto(page);
    await expect(page.getByTestId('crop-fit-height')).toContainText('세로 맞춤');
    await expect(page.getByTestId('crop-fit-width')).toContainText('가로 맞춤');
    await expect(page.getByTestId('crop-center')).toContainText('가운데');

    await page.locator('.crop-modal .modal-head .icon-btn').click();
    await expect(page.getByTestId('bg-crop-modal')).toHaveCount(0);
    await page.getByTestId('lang-en').click();
    await page.getByTestId('dock-props').click();
    await page.getByTestId('props-bg-add').click();
    await loadPhoto(page);
    await expect(page.getByTestId('crop-fit-height')).toContainText('Fit Height');
    await expect(page.getByTestId('crop-fit-width')).toContainText('Fit Width');
    await expect(page.getByTestId('crop-center')).toContainText('Center');
  });
});
