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

/** Where a design coordinate is drawn on screen, from the plate's own fit. */
async function plateMap(page: Page) {
  const spec = await saveSpec(page);
  const readout = await page.locator('.zoom-readout').innerText();
  const scale = Number.parseFloat(readout) / 100;
  const box = (await page.locator('canvas.stage-canvas').boundingBox())!;
  const ox = (box.width - spec.canvas.width * scale) / 2;
  const oy = (box.height - spec.canvas.height * scale) / 2;
  return {
    scale,
    spec,
    /** The canvas keeps pointer events: a click here is `page.mouse`-ready. */
    at: (x: number, y: number) => ({ x: box.x + ox + x * scale, y: box.y + oy + y * scale }),
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
    expect(Math.abs(moved - expected)).toBeLessThanOrEqual(6);
    /* a sideways drag may catch a magnet guide on a neighbouring slot's edge */
    const snapReach = 7 / plate.scale + 2;
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
    expect(Math.abs(moved - expected)).toBeLessThanOrEqual(6);
    expect(Math.abs(moved)).toBeLessThan(300);
    expect(Math.abs(after.cells[0].y - cell.y)).toBeLessThanOrEqual(7 / plate.scale + 2);
  });

  test('two fingers grow the slot by the pinch ratio once, not every frame', async ({ page }) => {
    await openStudio(page);
    const plate = await selectFirstSlot(page);
    const cell = plate.spec.cells[0];
    const midY = cell.y + cell.h / 2;
    const centerX = cell.x + cell.w / 2;
    const near = plate.at(centerX - 50, midY);
    const far = plate.at(centerX + 50, midY);
    const outerLeft = plate.at(centerX - 100, midY);
    const outerRight = plate.at(centerX + 100, midY);

    await page.evaluate(({ a, b, a2, b2 }) => {
      const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement;
      const fire = (type: string, id: number, clientX: number, clientY: number) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 21,
          clientX,
          clientY,
          buttons: type === 'pointerup' ? 0 : 1,
        }));
      };
      fire('pointerdown', 21, a.x, a.y);
      fire('pointerdown', 22, b.x, b.y);
      for (let step = 1; step <= 15; step += 1) {
        fire('pointermove', 21, a.x + ((a2.x - a.x) * step) / 15, a.y + ((a2.y - a.y) * step) / 15);
        fire('pointermove', 22, b.x + ((b2.x - b.x) * step) / 15, b.y + ((b2.y - b.y) * step) / 15);
      }
      fire('pointerup', 21, a2.x, a2.y);
      fire('pointerup', 22, b2.x, b2.y);
    }, { a: near, b: far, a2: outerLeft, b2: outerRight });

    const after = await saveSpec(page);
    const ratio = after.cells[0].w / cell.w;
    /* the two fingers went from 100px apart to 200px: twice as wide, once */
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.4);
    expect(after.cells[0].w).toBeLessThan(2000);
  });
});
