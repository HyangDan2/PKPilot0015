import { test, expect, isMobile, openStudio } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The plate's gesture paths, driven the way a finger drives them: a whole
 * pointerdown → 15 × pointermove → pointerup sequence, and two fingers.
 * A spec saved before and after the gesture is the measurement, because that
 * is the document the studio would hand back to the user.
 */

type SavedSpec = {
  canvas: { width: number; height: number };
  cells: { x: number; y: number; w: number; h: number }[];
  texts: { id: string; x: number; y: number; size: number }[];
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

/** Where a design coordinate is drawn on screen, from the plate's own viewport. */
async function plateMap(page: Page) {
  const spec = await saveSpec(page);
  const canvas = page.locator('canvas.stage-canvas');
  const box = (await canvas.boundingBox())!;
  const view = await canvas.evaluate((el) => ({
    scale: Number((el as HTMLCanvasElement).dataset.scale),
    ox: Number((el as HTMLCanvasElement).dataset.originX),
    oy: Number((el as HTMLCanvasElement).dataset.originY),
  }));
  return {
    scale: view.scale,
    spec,
    /** The canvas keeps pointer events: a click here is `page.mouse`-ready. */
    at: (x: number, y: number) => ({
      x: box.x + view.ox + x * view.scale,
      y: box.y + view.oy + y * view.scale,
    }),
  };
}

/**
 * Taps the first slot so it is the element the gesture acts on. On a desktop
 * that opens the property drawer, which narrows the plate, so the map is read
 * again afterwards.
 */
async function selectFirstSlot(page: Page) {
  const before = await plateMap(page);
  const cell = before.spec.cells[0];
  const point = before.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
  await page.mouse.click(point.x, point.y);
  if (!isMobile(page)) {
    await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'true');
  }
  await page.waitForTimeout(200);
  return plateMap(page);
}

/** The scale the plate is drawn at: a viewport pinch changes it, a layer one does not. */
async function plateScale(page: Page) {
  return page.locator('canvas.stage-canvas').evaluate((el) => Number((el as HTMLCanvasElement).dataset.scale));
}

/** The viewport pan, which a drag on an unselected layer moves instead of the layer. */
async function platePan(page: Page) {
  return page.locator('canvas.stage-canvas').evaluate((el) => ({
    x: Number((el as HTMLCanvasElement).dataset.panX),
    y: Number((el as HTMLCanvasElement).dataset.panY),
  }));
}

type Pt = { x: number; y: number };

/** Fires one touch pointer event at the canvas, exactly as the browser would. */
async function fire(page: Page, type: string, id: number, at: Pt) {
  await page.evaluate(({ type: kind, id: pointerId, at: point }) => {
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new PointerEvent(kind, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 71,
      clientX: point.x,
      clientY: point.y,
      buttons: kind === 'pointerup' ? 0 : 1,
    }));
  }, { type, id, at });
}

async function glide(page: Page, id: number, from: Pt, to: Pt, steps = 12) {
  await page.evaluate(({ id: pointerId, from: a, to: b, steps: count }) => {
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
    for (let step = 1; step <= count; step += 1) {
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: pointerId === 71,
        clientX: a.x + ((b.x - a.x) * step) / count,
        clientY: a.y + ((b.y - a.y) * step) / count,
        buttons: 1,
      }));
    }
  }, { id, from, to, steps });
}

/** A tap: down and up on the same pixel, nothing in between. */
async function tap(page: Page, at: Pt) {
  await fire(page, 'pointerdown', 71, at);
  await fire(page, 'pointerup', 71, at);
}

async function dragBy(page: Page, point: { x: number; y: number }, screenDx: number, steps = 15) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(point.x + (screenDx * step) / steps, point.y);
  }
  await page.mouse.up();
}

test.describe('dragging on the plate', () => {
  test('fifteen pointer moves of a 40px drag move the slot 40px, not thousands', async ({ page }) => {
    await openStudio(page);
    await expect(page.locator('.zoom-readout')).not.toHaveText('0%');
    const plate = await selectFirstSlot(page);
    const cell = plate.spec.cells[0];
    const start = plate.at(cell.x + cell.w / 2, cell.y + cell.h / 2);

    await dragBy(page, start, 40);

    const after = await saveSpec(page);
    const expected = 40 / plate.scale;
    const moved = after.cells[0].x - cell.x;
    /* the drag lands where the finger went, give or take one magnet step: the
       guides pull at 7px on screen, which is more design units the smaller the
       plate is drawn */
    const snapReach = 7 / plate.scale + 2;
    expect(Math.abs(moved - expected)).toBeLessThanOrEqual(snapReach);
    expect(moved).toBeGreaterThan(expected * 0.6);
    expect(moved).toBeLessThan(expected * 1.5);
    expect(Math.abs(after.cells[0].y - cell.y)).toBeLessThanOrEqual(snapReach);
    /* the bug threw the slot thousands of pixels off the 600-wide plate */
    expect(Math.abs(moved)).toBeLessThan(300);
    expect(after.cells[0].x).toBeGreaterThan(0);
    expect(after.cells[0].x + after.cells[0].w).toBeLessThan(after.canvas.width * 1.5);
  });

  test('a fifteen-step touch drag lands where the finger did', async ({ page }) => {
    await openStudio(page);
    const plate = await selectFirstSlot(page);
    const cell = plate.spec.cells[0];
    const start = plate.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    const steps = 15;
    const screenDx = 40;

    await page.evaluate(({ sx, sy, count, total }) => {
      const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
      const fire = (type: string, clientX: number, clientY: number) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          clientX,
          clientY,
          buttons: type === 'pointerup' ? 0 : 1,
        }));
      };
      fire('pointerdown', sx, sy);
      for (let step = 1; step <= count; step += 1) fire('pointermove', sx + (total * step) / count, sy);
      fire('pointerup', sx + total, sy);
    }, { sx: start.x, sy: start.y, count: steps, total: screenDx });

    const after = await saveSpec(page);
    const expected = screenDx / plate.scale;
    const moved = after.cells[0].x - cell.x;
    const snapReach = 7 / plate.scale + 2;
    expect(Math.abs(moved - expected)).toBeLessThanOrEqual(snapReach);
    expect(Math.abs(moved)).toBeLessThan(300);
    expect(Math.abs(after.cells[0].y - cell.y)).toBeLessThanOrEqual(snapReach);
  });

  test('two fingers pinched on a held slot grow it by the ratio once, not every frame', async ({ page }) => {
    await openStudio(page);
    const plate = await selectFirstSlot(page);
    const cell = plate.spec.cells[0];
    const midY = cell.y + cell.h / 2;
    const centerX = cell.x + cell.w / 2;
    const near = plate.at(centerX - 50, midY);
    const far = plate.at(centerX + 50, midY);
    const outerLeft = plate.at(centerX - 100, midY);
    const outerRight = plate.at(centerX + 100, midY);

    /* hold the selected slot first: only then is a second finger the layer's */
    await fire(page, 'pointerdown', 21, near);
    await page.waitForTimeout(220);
    await fire(page, 'pointerdown', 22, far);
    await glide(page, 21, near, outerLeft, 15);
    await glide(page, 22, far, outerRight, 15);
    await fire(page, 'pointerup', 21, outerLeft);
    await fire(page, 'pointerup', 22, outerRight);

    const after = await saveSpec(page);
    const ratio = after.cells[0].w / cell.w;
    /* the two fingers went from 100px apart to 200px: twice as wide, once */
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.4);
    expect(after.cells[0].w).toBeLessThan(2000);
  });

  test('two fingers in a hurry zoom the plate, never the slot under them', async ({ page }) => {
    await openStudio(page);
    const plate = await selectFirstSlot(page);
    const scaleBefore = await plateScale(page);
    const cell = plate.spec.cells[0];
    const centerX = cell.x + cell.w / 2;
    const midY = cell.y + cell.h / 2;
    const a = plate.at(centerX - 50, midY);
    const b = plate.at(centerX + 50, midY);
    const a2 = plate.at(centerX - 110, midY);
    const b2 = plate.at(centerX + 110, midY);

    /* both fingers land in the same breath, as a reaching hand does */
    await page.evaluate(({ a, b, a2, b2 }) => {
      const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
      const fire = (type: string, id: number, clientX: number, clientY: number) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
          isPrimary: id === 81, clientX, clientY, buttons: type === 'pointerup' ? 0 : 1,
        }));
      };
      fire('pointerdown', 81, a.x, a.y);
      fire('pointerdown', 82, b.x, b.y);
      for (let step = 1; step <= 15; step += 1) {
        fire('pointermove', 81, a.x + ((a2.x - a.x) * step) / 15, a.y + ((a2.y - a.y) * step) / 15);
        fire('pointermove', 82, b.x + ((b2.x - b.x) * step) / 15, b.y + ((b2.y - b.y) * step) / 15);
      }
      fire('pointerup', 81, a2.x, a2.y);
      fire('pointerup', 82, b2.x, b2.y);
    }, { a, b, a2, b2 });

    expect(await plateScale(page)).toBeGreaterThan(scaleBefore * 1.4);
    const after = await saveSpec(page);
    expect(after.cells[0].w, 'the slot keeps its size').toBe(cell.w);
    expect(after.cells[0].x).toBe(cell.x);
  });

  test('a quick second finger cancels the drag the first one had started', async ({ page }) => {
    await openStudio(page);
    const plate = await selectFirstSlot(page);
    const scaleBefore = await plateScale(page);
    const cell = plate.spec.cells[0];
    const start = plate.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    const second = { x: start.x + 60, y: start.y };
    const pulled = { x: start.x + 24, y: start.y };
    const spreadA = { x: start.x - 40, y: start.y };
    const spreadB = { x: second.x + 40, y: second.y };

    /* the finger drags the slot a little, then a second finger lands at once */
    await fire(page, 'pointerdown', 91, start);
    await glide(page, 91, start, pulled, 4);
    await fire(page, 'pointerdown', 92, second);
    await glide(page, 91, pulled, spreadA, 10);
    await glide(page, 92, second, spreadB, 10);
    await fire(page, 'pointerup', 91, spreadA);
    await fire(page, 'pointerup', 92, spreadB);

    expect(await plateScale(page), 'the view zoomed instead').toBeGreaterThan(scaleBefore * 1.4);
    const after = await saveSpec(page);
    expect(after.cells[0].x, 'the slot went back where it was').toBe(cell.x);
    expect(after.cells[0].y).toBe(cell.y);
    expect(after.cells[0].w).toBe(cell.w);
  });

  test('a short touch tap selects the slot, and a second tap elsewhere lets it go', async ({ page }) => {
    await openStudio(page);
    const plate = await plateMap(page);
    const cell = plate.spec.cells[0];
    const middle = plate.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    await tap(page, middle);

    await expect(page.getByTestId('context-bar')).toHaveAttribute('aria-label', /01/);
    const kept = await saveSpec(page);
    expect(kept.cells[0].x).toBe(cell.x);
    expect(kept.cells[0].y).toBe(cell.y);

    /* the empty margin left of the plate: a tap there drops the selection */
    const empty = { x: plate.at(0, 0).x - 30, y: middle.y };
    await tap(page, empty);
    await expect(page.getByTestId('context-bar')).toHaveCount(0);
  });

  test('a touch drag that starts on an unselected slot moves the plate, not the slot', async ({ page }) => {
    await openStudio(page);
    const plate = await plateMap(page);
    const cell = plate.spec.cells[0];
    const start = plate.at(cell.x + cell.w / 2, cell.y + cell.h / 2);
    const panBefore = await platePan(page);
    const scaleBefore = await plateScale(page);

    await fire(page, 'pointerdown', 93, start);
    await glide(page, 93, start, { x: start.x + 46, y: start.y + 22 }, 12);
    await fire(page, 'pointerup', 93, { x: start.x + 46, y: start.y + 22 });

    const panAfter = await platePan(page);
    expect(panAfter.x - panBefore.x).toBeGreaterThan(38);
    expect(panAfter.y - panBefore.y).toBeGreaterThan(16);
    expect(await plateScale(page)).toBeCloseTo(scaleBefore, 3);
    const after = await saveSpec(page);
    expect(after.cells[0]).toEqual(cell);
  });
});
