import { describe, expect, it } from 'vitest';
import {
  KEEP_VISIBLE, ZOOM_MAX, ZOOM_MIN, clampPan, clampZoom, fitInsets, fitScale,
  originOf, toDesignPoint, stepZoom, pinchAround, resolveScale, zoomAround,
  type Pan, type Size,
} from '../src/editor/viewport';

/**
 * The plate's viewport: one set of pure functions shared by the canvas, the
 * hit tests and the dock, so a wheel, a pinch and a `+` button all agree about
 * where a design coordinate is once the glass has moved.
 */

const stage: Size = { w: 1200, h: 800 };
const design: Size = { w: 600, h: 1800 }; /* the 1:3 strip */
const insets = fitInsets(stage.w);
const padded = { w: stage.w - insets.left - insets.right, h: stage.h - insets.top - insets.bottom };

describe('clampZoom', () => {
  it('holds the plate between 20% and 400%', () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(0.2)).toBe(0.2);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(clampZoom(12)).toBe(ZOOM_MAX);
  });

  it('survives a broken value instead of drawing at NaN', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MAX);
  });
});

describe('fit', () => {
  it('leaves the floating chrome its room and drops the rest to the plate', () => {
    const s = fitScale(stage, design, insets);
    expect(design.h * s).toBeLessThanOrEqual(padded.h + 1e-6);
    expect(design.w * s).toBeLessThanOrEqual(padded.w + 1e-6);
    /* the strip is height-bound on a landscape stage */
    expect(Math.abs(design.h * s - padded.h)).toBeLessThan(0.5);
  });

  it('gives a phone its own, smaller chrome allowance', () => {
    const phone = fitInsets(390);
    const desktop = fitInsets(1440);
    expect(phone.left).toBeLessThan(desktop.left);
    expect(phone.bottom).toBeGreaterThan(phone.top);
    expect(desktop.bottom).toBeGreaterThan(desktop.top);
  });

  it('resolves "fit" to a number and keeps a number as it is', () => {
    expect(resolveScale('fit', stage, design, insets)).toBeCloseTo(fitScale(stage, design, insets), 9);
    expect(resolveScale(2.5, stage, design, insets)).toBe(2.5);
    expect(resolveScale(9, stage, design, insets)).toBe(ZOOM_MAX);
  });
});

describe('origin and hit tests', () => {
  it('centres the plate in the padded area when nothing has moved', () => {
    const origin = originOf(1, { x: 0, y: 0 }, stage, design, insets);
    expect(origin.x).toBeCloseTo(insets.left + (padded.w - design.w) / 2, 6);
    expect(origin.y).toBeCloseTo(insets.top + (padded.h - design.h) / 2, 6);
  });

  it('moves the whole plate by exactly the pan', () => {
    const origin = originOf(0.5, { x: 37, y: -21 }, stage, design, insets);
    const still = originOf(0.5, { x: 0, y: 0 }, stage, design, insets);
    expect(origin.x - still.x).toBeCloseTo(37, 6);
    expect(origin.y - still.y).toBeCloseTo(-21, 6);
  });

  it('reads a stage pixel back as the design coordinate drawn there', () => {
    const scale = 1.4;
    const pan: Pan = { x: -90, y: 44 };
    const origin = originOf(scale, pan, stage, design, insets);
    const point = { x: 123, y: 456 };
    const local = { x: origin.x + point.x * scale, y: origin.y + point.y * scale };
    const back = toDesignPoint(local, scale, pan, stage, design, insets);
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });
});

describe('wheel zoom', () => {
  it('keeps the design point under the cursor, whatever the zoom becomes', () => {
    const local = { x: 480, y: 260 };
    const before = { zoom: 0.6 as number, pan: { x: -40, y: 25 } };
    const scale = resolveScale(before.zoom, stage, design, insets);
    const under = toDesignPoint(local, scale, before.pan, stage, design, insets);

    const next = zoomAround(before.zoom, before.pan, local, 1.7, stage, design, insets);
    expect(next.zoom).toBeCloseTo(0.6 * 1.7, 6);

    const nextScale = resolveScale(next.zoom, stage, design, insets);
    const stillUnder = toDesignPoint(local, nextScale, next.pan, stage, design, insets);
    expect(stillUnder.x).toBeCloseTo(under.x, 4);
    expect(stillUnder.y).toBeCloseTo(under.y, 4);
  });

  it('zooms out from "fit" and keeps the anchor', () => {
    const local = { x: 300, y: 400 };
    const fit = fitScale(stage, design, insets);
    const under = toDesignPoint(local, fit, { x: 0, y: 0 }, stage, design, insets);
    const next = zoomAround('fit', { x: 0, y: 0 }, local, 0.5, stage, design, insets);
    expect(next.zoom).toBeCloseTo(Math.max(ZOOM_MIN, fit * 0.5), 6);
    const stillUnder = toDesignPoint(local, next.zoom as number, next.pan, stage, design, insets);
    expect(stillUnder.x).toBeCloseTo(under.x, 3);
    expect(stillUnder.y).toBeCloseTo(under.y, 3);
  });

  it('stops at 400% no matter how much wheel arrives', () => {
    let view = { zoom: 1 as number | 'fit', pan: { x: 0, y: 0 } };
    for (let i = 0; i < 40; i += 1) view = zoomAround(view.zoom, view.pan, { x: 600, y: 400 }, 1.5, stage, design, insets);
    expect(view.zoom).toBe(ZOOM_MAX);
  });

  it('stops at 20% on the way out', () => {
    let view = { zoom: 1 as number | 'fit', pan: { x: 0, y: 0 } };
    for (let i = 0; i < 40; i += 1) view = zoomAround(view.zoom, view.pan, { x: 600, y: 400 }, 0.6, stage, design, insets);
    expect(view.zoom).toBe(ZOOM_MIN);
  });
});

describe('two-finger viewport pinch', () => {
  it('zooms by the ratio and follows the midpoint as it travels', () => {
    const anchor = { x: 300, y: 900 };
    const to = { x: 700, y: 520 };
    const next = pinchAround(anchor, 0.4, 1.5, to, stage, design, insets);
    expect(next.zoom).toBeCloseTo(0.6, 6);
    const under = toDesignPoint(to, 0.6, next.pan, stage, design, insets);
    expect(under.x).toBeCloseTo(anchor.x, 4);
    expect(under.y).toBeCloseTo(anchor.y, 4);
    /* and it really moved the viewport, not just the scale */
    expect(Math.abs(next.pan.x - 0)).toBeGreaterThan(1);
  });

  it('leaves the mid point alone when the fingers only spread', () => {
    const mid = { x: 620, y: 430 };
    const next = pinchAround({ x: 100, y: 100 }, 0.8, 2, mid, stage, design, insets);
    expect(next.zoom).toBeCloseTo(1.6, 6);
    const under = toDesignPoint(mid, 1.6, next.pan, stage, design, insets);
    expect(under.x).toBeCloseTo(100, 4);
    expect(under.y).toBeCloseTo(100, 4);
  });
});

describe('pan limits', () => {
  it('never lets the plate leave the stage completely', () => {
    const scale = 1;
    const corner = clampPan({ x: 1e6, y: 1e6 }, scale, stage, design, insets);
    const origin = originOf(scale, corner, stage, design, insets);
    expect(origin.x).toBeLessThanOrEqual(stage.w - KEEP_VISIBLE + 1e-6);
    expect(origin.y).toBeLessThanOrEqual(stage.h - KEEP_VISIBLE + 1e-6);

    const other = clampPan({ x: -1e6, y: -1e6 }, scale, stage, design, insets);
    const lifted = originOf(scale, other, stage, design, insets);
    expect(lifted.x + design.w * scale).toBeGreaterThanOrEqual(KEEP_VISIBLE - 1e-6);
    expect(lifted.y + design.h * scale).toBeGreaterThanOrEqual(KEEP_VISIBLE - 1e-6);
  });

  it('lets a small pan through untouched', () => {
    const pan = { x: 12, y: -8 };
    expect(clampPan(pan, 0.5, stage, design, insets)).toEqual(pan);
  });
});

describe('stepZoom', () => {
  it('takes a round step up and down', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25, 6);
    expect(stepZoom(1, -1)).toBeCloseTo(0.8, 6);
  });

  it('does not walk past the ends', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});
