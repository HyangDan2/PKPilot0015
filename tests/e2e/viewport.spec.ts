import type { Page } from '@playwright/test';
import { test, expect, isMobile, openStudio } from './fixtures';

/**
 * The plate's own viewport. A frame is taller than most screens, so the glass
 * it is painted on now zooms from 20% to 400% and moves freely in X/Y — while
 * the frame underneath keeps its design coordinates and its layers keep their
 * own gestures. These tests drive both: the view moves, the document does not.
 */

type SavedSpec = {
  canvas: { width: number; height: number };
  cells: { x: number; y: number; w: number; h: number }[];
  texts: { id: string; x: number; y: number }[];
};

async function saveSpec(page: Page): Promise<SavedSpec> {
  if (isMobile(page)) await page.getByTestId('dock-save-toggle').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('dock-save').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as SavedSpec;
}

/**
 * What the canvas says about itself: the scale it drew at, the viewport pan,
 * and where design (0, 0) landed. `at()` turns a design coordinate into the
 * screen pixel the user would touch.
 */
async function view(page: Page) {
  const canvas = page.locator('canvas.stage-canvas');
  const box = (await canvas.boundingBox())!;
  const data = await canvas.evaluate((el) => {
    const node = el as HTMLCanvasElement;
    return {
      scale: Number(node.dataset.scale),
      zoom: String(node.dataset.zoom),
      pan: { x: Number(node.dataset.panX), y: Number(node.dataset.panY) },
      origin: { x: Number(node.dataset.originX), y: Number(node.dataset.originY) },
    };
  });
  return {
    ...data,
    box,
    at: (x: number, y: number) => ({
      x: box.x + data.origin.x + x * data.scale,
      y: box.y + data.origin.y + y * data.scale,
    }),
    /** A spot no layer covers: the margin the plate leaves at its left. */
    margin: () => ({ x: box.x + data.origin.x - 34, y: box.y + box.height * 0.5 }),
  };
}

/** A real pointer sequence as the browser would deliver it to the canvas. */
async function touch(
  page: Page,
  paths: { id: number; from: { x: number; y: number }; to: { x: number; y: number } }[],
  steps = 12,
) {
  await page.evaluate(({ paths: route, steps: count }) => {
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
    const fire = (type: string, id: number, clientX: number, clientY: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: 'touch',
        isPrimary: id === route[0].id,
        clientX,
        clientY,
        buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    route.forEach((path) => fire('pointerdown', path.id, path.from.x, path.from.y));
    for (let step = 1; step <= count; step += 1) {
      route.forEach((path) => fire(
        'pointermove',
        path.id,
        path.from.x + ((path.to.x - path.from.x) * step) / count,
        path.from.y + ((path.to.y - path.from.y) * step) / count,
      ));
    }
    route.forEach((path) => fire('pointerup', path.id, path.to.x, path.to.y));
  }, { paths, steps });
}

async function panBy(page: Page, point: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(point.x + (dx * step) / 12, point.y + (dy * step) / 12);
  }
  await page.mouse.up();
}

test.describe('the plate viewport', () => {
  test('a wheel zoom keeps the design point under the cursor', async ({ page }) => {
    test.skip(isMobile(page), 'a phone zooms with two fingers, covered below');
    await openStudio(page);
    const before = await view(page);
    const spec = await saveSpec(page);
    const cell = spec.cells[0];
    const cursor = before.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    const designUnder = {
      x: (Math.round(cursor.x) - before.box.x - before.origin.x) / before.scale,
      y: (Math.round(cursor.y) - before.box.y - before.origin.y) / before.scale,
    };

    /* the browser rounds a pointer to whole pixels; the anchor is exact there */
    const pixel = { x: Math.round(cursor.x), y: Math.round(cursor.y) };
    await page.mouse.move(pixel.x, pixel.y);
    for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(before.scale * 1.2);

    const after = await view(page);
    /* the same pixel still shows the same spot of the frame */
    const stillUnder = {
      x: (Math.round(cursor.x) - after.box.x - after.origin.x) / after.scale,
      y: (Math.round(cursor.y) - after.box.y - after.origin.y) / after.scale,
    };
    expect(Math.abs(stillUnder.x - designUnder.x)).toBeLessThan(0.5);
    expect(Math.abs(stillUnder.y - designUnder.y)).toBeLessThan(0.5);
  });

  test('the wheel stops at 400% and at 20%', async ({ page }) => {
    test.skip(isMobile(page), 'the wheel is a desktop gesture');
    await openStudio(page);
    const start = await view(page);
    const middle = { x: start.box.x + start.box.width / 2, y: start.box.y + start.box.height / 2 };

    await page.mouse.move(middle.x, middle.y);
    for (let i = 0; i < 30; i += 1) await page.mouse.wheel(0, -120);
    await expect(page.locator('.zoom-readout')).toHaveText('400%');
    expect((await view(page)).scale).toBeCloseTo(4, 3);

    for (let i = 0; i < 60; i += 1) await page.mouse.wheel(0, 120);
    await expect(page.locator('.zoom-readout')).toHaveText('20%');
    expect((await view(page)).scale).toBeCloseTo(0.2, 3);
  });

  test('an empty drag pans the plate, and a tap there drops the selection', async ({ page }) => {
    await openStudio(page);
    const before = await view(page);
    const spot = before.margin();
    await panBy(page, spot, 46, -38);

    const moved = await view(page);
    expect(moved.pan.x).toBeGreaterThan(40);
    expect(moved.pan.y).toBeLessThan(-32);
    expect(moved.zoom).toBe(before.zoom);
    /* the plate really travelled: the same design point sits elsewhere now */
    expect(moved.origin.x - before.origin.x).toBeCloseTo(moved.pan.x, 0);
    expect(moved.origin.y - before.origin.y).toBeCloseTo(moved.pan.y, 0);

    /* tapping the empty spot lets the selection go without moving the plate */
    const spec = await saveSpec(page);
    const cell = spec.cells[0];
    const at = moved.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('context-bar')).toBeVisible();

    const tap = { x: moved.margin().x - 30, y: moved.box.y + moved.box.height * 0.5 };
    await page.mouse.click(tap.x, tap.y);
    await expect(page.getByTestId('context-bar')).toHaveCount(0);
    const kept = await view(page);
    expect(kept.pan.x).toBeCloseTo(moved.pan.x, 0);
    expect(kept.pan.y).toBeCloseTo(moved.pan.y, 0);
  });

  test('Space and the middle button turn any spot into the camera', async ({ page }) => {
    test.skip(isMobile(page), 'a keyboard and a middle button are desktop things');
    await openStudio(page);
    const spec = await saveSpec(page);
    const before = await view(page);
    const cell = before.at(spec.cells[0].x + spec.cells[0].w / 2, spec.cells[0].y + spec.cells[0].h / 2);

    /* Space + drag over a slot pans the plate, and the slot does not budge */
    await page.keyboard.down('Space');
    await panBy(page, cell, 60, 30);
    await page.keyboard.up('Space');
    const afterSpace = await view(page);
    expect(afterSpace.pan.x - before.pan.x).toBeGreaterThan(50);
    expect(afterSpace.pan.y - before.pan.y).toBeGreaterThan(22);
    const untouched = await saveSpec(page);
    expect(untouched.cells[0]).toEqual(spec.cells[0]);

    /* the middle button does the same without the keyboard */
    await page.mouse.move(cell.x, cell.y);
    await page.mouse.down({ button: 'middle' });
    for (let step = 1; step <= 12; step += 1) await page.mouse.move(cell.x - (40 * step) / 12, cell.y);
    await page.mouse.up({ button: 'middle' });
    const afterMiddle = await view(page);
    expect(afterMiddle.pan.x).toBeLessThan(afterSpace.pan.x - 30);
    expect((await saveSpec(page)).cells[0]).toEqual(spec.cells[0]);
  });

  test('the − and + buttons step the zoom, and the capsule fits the screen', async ({ page }) => {
    await openStudio(page);
    const start = await view(page);

    await page.getByTestId('zoom-in').click();
    await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(start.scale);
    const up = (await view(page)).scale;
    await page.getByTestId('zoom-in').click();
    await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(up);

    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    const down = (await view(page)).scale;
    expect(down).toBeLessThan(up);

    /* a phone is where it has to fit: the capsule never leaves the screen */
    const viewport = page.viewportSize()!;
    const capsule = await page.locator('.zoom-capsule').boundingBox();
    expect(capsule!.x).toBeGreaterThanOrEqual(0);
    expect(capsule!.x + capsule!.width).toBeLessThanOrEqual(viewport.width);
    const overflow = await page.locator('.zoom-capsule').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(docOverflow).toBeLessThanOrEqual(0);
  });

  test('a finger on the empty stage moves the plate', async ({ page }) => {
    await openStudio(page);
    const before = await view(page);
    const spot = before.margin();
    await touch(page, [{ id: 31, from: spot, to: { x: spot.x + 44, y: spot.y + 26 } }]);

    const moved = await view(page);
    expect(moved.pan.x).toBeGreaterThan(38);
    expect(moved.pan.y).toBeGreaterThan(20);
    expect(moved.zoom).toBe(before.zoom);
  });

  test('two fingers zoom the viewport when nothing is selected', async ({ page }) => {
    await openStudio(page);
    const before = await view(page);
    const middle = before.margin();
    const a = { x: middle.x - 30, y: middle.y };
    const b = { x: middle.x + 30, y: middle.y };
    await touch(page, [
      { id: 41, from: a, to: { x: a.x - 40, y: a.y } },
      { id: 42, from: b, to: { x: b.x + 40, y: b.y + 20 } },
    ]);

    const after = await view(page);
    expect(after.scale).toBeGreaterThan(before.scale * 1.5);
    /* the midpoint travelled with the fingers, so the viewport moved too */
    expect(Math.abs(after.pan.y - before.pan.y)).toBeGreaterThan(2);
  });

  test('two fingers on the selected slot still edit the slot, not the view', async ({ page }) => {
    await openStudio(page);
    const spec = await saveSpec(page);
    const start = await view(page);
    const cell = spec.cells[0];
    const center = start.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    await page.mouse.click(center.x, center.y);
    await expect(page.getByTestId('context-bar')).toBeVisible();
    if (!isMobile(page)) {
      /* the property rail narrows the plate; read the map again */
      await page.keyboard.press('Escape');
    }
    const own = await view(page);
    const mid = own.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    await touch(page, [
      { id: 51, from: { x: mid.x - 30, y: mid.y }, to: { x: mid.x - 70, y: mid.y } },
      { id: 52, from: { x: mid.x + 30, y: mid.y }, to: { x: mid.x + 70, y: mid.y } },
    ]);

    const after = await view(page);
    expect(after.scale).toBeCloseTo(own.scale, 3);
    expect(after.pan.x).toBeCloseTo(own.pan.x, 0);
    const resized = await saveSpec(page);
    expect(resized.cells[0].w).toBeGreaterThan(cell.w * 1.2);
  });

  test('a zoomed, moved plate still selects and moves the same slot', async ({ page }) => {
    await openStudio(page);
    const spec = await saveSpec(page);
    await page.getByTestId('zoom-in').click();
    await page.getByTestId('zoom-in').click();
    const zoomed = await view(page);
    const spot = zoomed.margin();
    await panBy(page, spot, 30, 20);
    const placed = await view(page);

    const cell = spec.cells[0];
    const center = placed.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    await page.mouse.click(center.x, center.y);
    await expect(page.getByTestId('context-bar')).toBeVisible();
    await expect(page.getByTestId('context-bar')).toHaveAttribute('aria-label', /01/);
    if (!isMobile(page)) await page.keyboard.press('Escape');

    /* below the floating bar that now sits over the top of the plate */
    const dragFrom = await view(page);
    const at = dragFrom.at(cell.x + cell.w / 2, cell.y + cell.h * 0.7);
    await panBy(page, at, 36, 0);
    const moved = await saveSpec(page);
    const expected = 36 / dragFrom.scale;
    const snapReach = 7 / dragFrom.scale + 2;
    expect(Math.abs(moved.cells[0].x - cell.x - expected)).toBeLessThanOrEqual(snapReach);
    expect(moved.cells[0].y).toBeGreaterThan(cell.y - 1);
  });

  test('Fit brings the plate back to the middle of its stage', async ({ page }) => {
    await openStudio(page);
    const start = await view(page);
    const spot = start.margin();
    await panBy(page, spot, 40, 34);
    expect((await view(page)).pan.x).toBeGreaterThan(30);

    await page.getByTestId('zoom-fit').click();
    const fitted = await view(page);
    expect(fitted.zoom).toBe('fit');
    expect(fitted.pan.x).toBeCloseTo(0, 1);
    expect(fitted.pan.y).toBeCloseTo(0, 1);
    expect(fitted.scale).toBeCloseTo(start.scale, 3);
    expect(fitted.origin.x).toBeCloseTo(start.origin.x, 1);
  });

  test('saving after zoom and pan writes the authored frame, not the view', async ({ page }) => {
    await openStudio(page);
    const before = await saveSpec(page);
    const start = await view(page);
    const spot = start.margin();
    await panBy(page, spot, 52, 28);
    await page.getByTestId('zoom-in').click();
    await page.getByTestId('zoom-100').click();
    const zoomed = await view(page);
    expect(zoomed.scale).toBeGreaterThan(start.scale);

    const after = await saveSpec(page);
    expect(after.cells).toEqual(before.cells);
    expect(after.texts).toEqual(before.texts);
    expect(after.canvas).toEqual(before.canvas);
  });
});
