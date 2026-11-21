import { describe, expect, it } from 'vitest';
import {
  MIN_CROP,
  centerCrop,
  containBox,
  fitHeight,
  fitWidth,
  frameRatio,
  moveCrop,
  resizeCrop,
  toSourceRect,
} from '../src/editor/cropbox';

const photo = { w: 800, h: 600 }; /* a 4:3 landscape photograph */
const strip = frameRatio(600, 1800); /* a 1:3 tall plate */

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('containBox', () => {
  it('shows the whole photograph inside the viewport keeping its ratio', () => {
    const drawn = containBox(photo, { w: 700, h: 700 });
    expect(close(drawn.w, 700)).toBe(true);
    expect(close(drawn.h, 700 * (600 / 800))).toBe(true);
  });

  it('fits by height when the viewport is narrower than the photograph', () => {
    const drawn = containBox({ w: 1200, h: 600 }, { w: 300, h: 600 });
    expect(close(drawn.w, 300)).toBe(true);
    expect(close(drawn.h, 150)).toBe(true);
  });

  it('is empty without a photograph or a viewport', () => {
    expect(containBox({ w: 0, h: 0 }, { w: 700, h: 700 })).toEqual({ w: 0, h: 0 });
    expect(containBox(photo, { w: 0, h: 0 })).toEqual({ w: 0, h: 0 });
  });
});

describe('fitting the window to the photograph', () => {
  const drawn = { w: 800, h: 600 };

  it('fit height puts the window at the photograph height, centred', () => {
    const rect = fitHeight(drawn, strip);
    expect(close(rect.h, 600)).toBe(true);
    expect(close(rect.w, 600 * strip)).toBe(true); /* 600/3 = 200 */
    expect(close(rect.x, (800 - rect.w) / 2)).toBe(true);
    expect(close(rect.y, 0)).toBe(true);
  });

  it('fit width runs the width to the photograph and clamps the height to it', () => {
    const rect = fitWidth(drawn, strip);
    expect(close(rect.w, 600 * strip)).toBe(true); /* 1:3 at 600 tall is 200 wide */
    expect(close(rect.h, 600)).toBe(true);
    expect(close(rect.x, (800 - rect.w) / 2)).toBe(true);
    expect(close(rect.y, 0)).toBe(true);
  });

  it('a wide plate clamps to the photograph height instead', () => {
    const wide = frameRatio(1600, 900); /* 16:9 */
    const rect = fitWidth(drawn, wide);
    expect(close(rect.w, 800)).toBe(true);
    expect(close(rect.h, 450)).toBe(true);
    expect(close(rect.y, (600 - 450) / 2)).toBe(true);
  });

  it('center keeps the current size and puts it in the middle', () => {
    const moved = { x: 0, y: 0, w: 300, h: 300 };
    const rect = centerCrop(moved, drawn);
    expect(rect).toEqual({ x: 250, y: 150, w: 300, h: 300 });
  });

  it('never makes a window larger than the photograph', () => {
    const rect = centerCrop({ x: 0, y: 0, w: 2000, h: 2000 }, drawn);
    expect(rect.w).toBe(800);
    expect(rect.h).toBe(600);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
  });
});

describe('moving the window', () => {
  const rect = { x: 100, y: 100, w: 200, h: 300 };

  it('applies the total offset from where the drag began, never accumulating', () => {
    const first = moveCrop(rect, 10, 10, photo);
    const later = moveCrop(rect, 40, 40, photo);
    expect(first).toEqual({ x: 110, y: 110, w: 200, h: 300 });
    expect(later).toEqual({ x: 140, y: 140, w: 200, h: 300 });
  });

  it('stays inside the photograph', () => {
    expect(moveCrop(rect, -500, -500, photo)).toMatchObject({ x: 0, y: 0 });
    expect(moveCrop(rect, 5000, 5000, photo)).toMatchObject({ x: 600, y: 300 });
  });
});

describe('resizing from a corner', () => {
  const rect = { x: 200, y: 150, w: 200, h: 300 };

  it('keeps the frame ratio and pins the opposite corner', () => {
    const bigger = resizeCrop(rect, 'se', 40, 0, photo, 2 / 3);
    expect(close(bigger.w / bigger.h, 2 / 3)).toBe(true);
    expect(bigger.x).toBe(200);
    expect(bigger.y).toBe(150);
    expect(close(bigger.w, 240)).toBe(true);
  });

  it('grows upward and leftward from the nw corner without moving the se corner', () => {
    const out = resizeCrop(rect, 'nw', -60, 0, { w: 800, h: 600 }, 2 / 3);
    expect(close(out.w / out.h, 2 / 3)).toBe(true);
    expect(close(out.x + out.w, rect.x + rect.w)).toBe(true);
    expect(close(out.y + out.h, rect.y + rect.h)).toBe(true);
    expect(out.w).toBeGreaterThan(rect.w);
  });

  it('follows a vertical drag as well as a horizontal one', () => {
    const out = resizeCrop(rect, 'se', 0, 60, photo, 2 / 3);
    expect(close(out.w / out.h, 2 / 3)).toBe(true);
    expect(out.w).toBeGreaterThan(rect.w);
  });

  it('stops at the photograph edge', () => {
    const out = resizeCrop(rect, 'se', 5000, 5000, photo, 2 / 3);
    expect(out.x + out.w).toBeLessThanOrEqual(photo.w + 1e-6);
    expect(out.y + out.h).toBeLessThanOrEqual(photo.h + 1e-6);
  });

  it('keeps a grabbable minimum', () => {
    const out = resizeCrop(rect, 'se', -5000, -5000, photo, 2 / 3);
    expect(out.w).toBeCloseTo(MIN_CROP, 6);
    expect(out.x).toBe(rect.x);
    expect(out.y).toBe(rect.y);
  });
});

describe('toSourceRect', () => {
  it('turns the marked window back into original pixels', () => {
    const drawn = { w: 400, h: 300 }; /* the 800×600 photograph at half size */
    const src = toSourceRect({ x: 100, y: 75, w: 200, h: 150 }, drawn, photo);
    expect(src).toEqual({ x: 200, y: 150, w: 400, h: 300 });
  });

  it('never steps outside the original file', () => {
    const drawn = { w: 400, h: 300 };
    const src = toSourceRect({ x: -20, y: -20, w: 460, h: 340 }, drawn, photo);
    expect(src.x).toBe(0);
    expect(src.y).toBe(0);
    expect(src.x + src.w).toBeLessThanOrEqual(photo.w);
    expect(src.y + src.h).toBeLessThanOrEqual(photo.h);
  });
});
