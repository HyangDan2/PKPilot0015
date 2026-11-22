import type { Page } from '@playwright/test';
import { test, expect, openStudio } from './fixtures';

/**
 * A photograph chosen behind the plate, and the photographs in its slots, must
 * survive whatever the frame does next: a stretched crop window, a new layout,
 * a bigger canvas, a cell that is grown and turned. The regression this guards
 * is a plate that quietly lost its own contents the moment it was adjusted.
 */

type Rgb = [number, number, number];

/* four unmistakable quarters, so the plate can be checked by its pixels */
const QUARTERS: Rgb[] = [[178, 62, 46], [46, 106, 162], [62, 121, 57], [200, 161, 38]];
const MAGENTA: Rgb = [230, 0, 230];
const PAPER: Rgb = [244, 241, 234];
const TARGETS = [...QUARTERS, MAGENTA, PAPER];

const FILENAME = { name: 'e2e-photo.png', mimeType: 'image/png' } as const;

async function quadrantPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate((colours) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    colours.forEach((colour, i) => {
      ctx.fillStyle = `rgb(${colour[0]},${colour[1]},${colour[2]})`;
      ctx.fillRect((i % 2) * 600, Math.floor(i / 2) * 450, 600, 450);
    });
    return canvas.toDataURL('image/png');
  }, QUARTERS);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function solidPhoto(page: Page, colour: Rgb): Promise<Buffer> {
  const dataUrl = await page.evaluate((c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL('image/png');
  }, colour);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** How much of the painted plate wears each colour. */
async function paint(page: Page) {
  const result = await page.locator('canvas.stage-canvas').evaluate((el, targets) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H).data;
    const counts = (targets as number[][]).map(() => 0);
    let plate = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      plate += 1;
      for (let t = 0; t < targets.length; t += 1) {
        const c = targets[t];
        if (Math.abs(data[i] - c[0]) <= 26 && Math.abs(data[i + 1] - c[1]) <= 26 && Math.abs(data[i + 2] - c[2]) <= 26) {
          counts[t] += 1;
          break;
        }
      }
    }
    return { plate, counts };
  }, TARGETS as unknown as number[][]);
  const [red, blue, green, gold, magenta, paper] = result.counts;
  return { plate: result.plate, quarters: { red, blue, green, gold }, magenta, paper };
}

/** The plate's own box on the page, read from the pixels it painted. */
async function plateBox(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
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

/** Pixels along the plate a design coordinate lands on. */
async function at(page: Page, designX: number, designY: number) {
  const [box, canvasSize] = await Promise.all([
    plateBox(page),
    page.evaluate(async () => {
      const rows = await window.ShutterFrame!.store.list();
      const spec = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
      return { w: spec.canvas.width, h: spec.canvas.height };
    }),
  ]);
  return { x: box.x + (designX / canvasSize.w) * box.w, y: box.y + (designY / canvasSize.h) * box.h };
}

async function stored(page: Page) {
  return page.evaluate(async () => {
    const rows = await window.ShutterFrame!.store.list();
    const spec = rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    return spec ? JSON.parse(JSON.stringify(spec)) : null;
  });
}

/** The properties drawer is a rail on a wide screen and a sheet on a phone. */
async function ensureProps(page: Page) {
  const shown = await page.getByTestId('drawer-right').isVisible().catch(() => false);
  if (!shown) await page.getByTestId('dock-props').click();
  await expect(page.getByTestId('drawer-right')).toBeVisible();
}

async function openCrop(page: Page) {
  await openStudio(page);
  await page.getByTestId('dock-props').click();
  const add = page.getByTestId('props-bg-add');
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await expect(page.getByTestId('bg-crop-modal')).toBeVisible();
}

async function chooseBackground(page: Page, buffer: Buffer) {
  await page.locator('#bg-file').setInputFiles({ ...FILENAME, buffer });
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

/** A crop window that was moved, stretched and re-fitted before it was applied. */
async function adjustCrop(page: Page) {
  const start = await page.getByTestId('crop-box').boundingBox();
  const grip = await page.getByTestId('crop-handle-se').boundingBox();
  if (!start || !grip) throw new Error('no crop box');
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(from.x - (48 * i) / 12, from.y - (64 * i) / 12);
  await page.mouse.up();
  await page.getByTestId('crop-fit-width').click();

  const box = await page.getByTestId('crop-box').boundingBox();
  if (!box) throw new Error('no crop box');
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(centre.x + i * 4, centre.y + i * 2);
  await page.mouse.up();
}

async function applyCrop(page: Page) {
  await page.getByTestId('bg-apply').click();
  await page.getByTestId('bg-crop-modal').waitFor({ state: 'detached' });
  /* the shelf keeps the frame 550ms after the last edit */
  await page.waitForTimeout(900);
}

/** A photograph of its own in the first slot, through the plate's double tap. */
async function putSlotPhoto(page: Page, buffer: Buffer) {
  const centre = await at(page, 300, 286);
  await page.mouse.dblclick(centre.x, centre.y);
  await page.locator('.stage input[type="file"]').setInputFiles({ ...FILENAME, buffer });
  await page.waitForTimeout(800);
}

async function expectPhotoPainted(page: Page, label: string) {
  const shot = await paint(page);
  expect(shot.plate, `${label}: the plate is painted`).toBeGreaterThan(2000);
  for (const [name, count] of Object.entries(shot.quarters)) {
    expect(count, `${label}: ${name} quarter of the photograph`).toBeGreaterThan(150);
  }
  return shot;
}

test.describe('a photograph survives the frame being adjusted', () => {
  test('a moved and stretched crop window still prints the photograph', async ({ page }) => {
    await openCrop(page);
    await chooseBackground(page, await quadrantPhoto(page));
    await adjustCrop(page);
    await applyCrop(page);

    await expectPhotoPainted(page, 'after the crop was adjusted');
    expect((await stored(page))?.canvas.backgroundImage?.dataUrl).toContain('data:image/');
  });

  test('a new layout keeps the photograph behind the plate', async ({ page }) => {
    await openCrop(page);
    await chooseBackground(page, await quadrantPhoto(page));
    await applyCrop(page);
    await expectPhotoPainted(page, 'before the layout changed');

    await page.keyboard.press('Escape');
    await page.getByTestId('dock-presets').click();
    const preset = page.locator('.preset-nordic-grid');
    await preset.scrollIntoViewIfNeeded();
    await preset.click();
    await page.waitForTimeout(1100);

    await expectPhotoPainted(page, 'after the layout changed');
    const after = await stored(page);
    expect(after?.name).toBe('Nordic Grid');
    expect(after?.canvas.backgroundImage?.dataUrl).toContain('data:image/');
  });

  test('a stretched canvas keeps the photograph and the slots', async ({ page }) => {
    await openCrop(page);
    await chooseBackground(page, await quadrantPhoto(page));
    await applyCrop(page);
    await page.keyboard.press('Escape');
    await putSlotPhoto(page, await solidPhoto(page, MAGENTA));

    let shot = await paint(page);
    expect(shot.magenta, 'the slot photograph before the stretch').toBeGreaterThan(200);

    await ensureProps(page);
    const chip = page.locator('.preset-grid .chip', { hasText: '2×2 · 1200×1600' }).first();
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await page.waitForTimeout(1100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    shot = await paint(page);
    expect(shot.quarters.red, 'the photograph after the stretch').toBeGreaterThan(150);
    expect(shot.quarters.blue, 'the photograph after the stretch').toBeGreaterThan(150);
    expect(shot.magenta, 'the slot photograph after the stretch').toBeGreaterThan(150);
    expect(shot.paper, 'the plate is not left as bare paper').toBeLessThan(shot.plate * 0.5);

    const after = await stored(page);
    expect(after?.canvas.width).toBe(1200);
    expect(after?.canvas.height).toBe(1600);
    expect(after?.canvas.backgroundImage?.dataUrl).toContain('data:image/');
  });

  test('a cell that is turned and grown keeps the plate whole', async ({ page }) => {
    await openCrop(page);
    await chooseBackground(page, await quadrantPhoto(page));
    await applyCrop(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await putSlotPhoto(page, await solidPhoto(page, MAGENTA));

    /* select the first cut, then turn it by its top grip and grow its far corner */
    const centre = await at(page, 300, 286);
    await page.mouse.click(centre.x, centre.y);
    await page.waitForTimeout(250);
    const top = await at(page, 300, 96);
    await page.mouse.move(top.x, top.y - 34);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(top.x + i * 9, top.y - 34 - i * 2);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const corner = await at(page, 564, 476);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(corner.x - i * 2, corner.y - i * 3);
    await page.mouse.up();
    await page.waitForTimeout(900);

    const shot = await paint(page);
    expect(shot.magenta, 'the slot photograph after the turn').toBeGreaterThan(150);
    expect(shot.quarters.red, 'the photograph after the turn').toBeGreaterThan(150);
    await expect.poll(async () => (await stored(page))?.cells[0].rotation ?? 0, { timeout: 5000 }).not.toBe(0);
    const after = await stored(page);
    expect(after?.canvas.backgroundImage?.dataUrl).toContain('data:image/');
  });

  test('removing the photograph leaves the plate and its slots intact', async ({ page }) => {
    await openCrop(page);
    await chooseBackground(page, await quadrantPhoto(page));
    await applyCrop(page);
    await page.keyboard.press('Escape');
    await putSlotPhoto(page, await solidPhoto(page, MAGENTA));

    await ensureProps(page);
    const remove = page.locator('.bg-actions .danger').first();
    await remove.scrollIntoViewIfNeeded();
    await remove.click();
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const shot = await paint(page);
    expect(shot.magenta, 'the slot photograph stays').toBeGreaterThan(150);
    expect(shot.paper, 'the plate falls back to its paper').toBeGreaterThan(500);
    expect((await stored(page))?.canvas.backgroundImage).toBeUndefined();
  });

  test('the plate opens in the clear part of its stage', async ({ page }) => {
    await openStudio(page);
    await page.waitForTimeout(400);
    const [box, stage, capsule] = await Promise.all([
      plateBox(page),
      page.locator('canvas.stage-canvas').boundingBox(),
      page.locator('.zoom-capsule').boundingBox(),
    ]);
    if (!stage || !capsule) throw new Error('no stage');
    /* the viewport is the whole stage now: the plate fits it and is centred
       across, while the floating dock's room is respected top and bottom */
    expect(box.w).toBeLessThanOrEqual(stage.width + 1);
    expect(box.h).toBeLessThanOrEqual(stage.height + 1);
    expect(Math.abs(box.x + box.w / 2 - (stage.x + stage.width / 2))).toBeLessThan(3);
    expect(box.y).toBeGreaterThan(stage.y + 20);
    expect(box.y + box.h).toBeLessThanOrEqual(capsule.y + 1);
    /* and it uses the room it has: on a phone the 1:3 strip is height-bound */
    const readout = await page.locator('.zoom-readout').textContent();
    const shown = Number((readout ?? '0').replace('%', '')) / 100;
    const drawn = box.h / 1800;
    expect(Math.abs(shown - drawn)).toBeLessThan(0.02);
    expect(box.h).toBeGreaterThan(stage.height * 0.7);
  });
});
