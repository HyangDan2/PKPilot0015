import { describe, expect, it } from 'vitest';
import { hitHandle, handlePoints, resizeBox, rotatePoint, snapAngle, snapMove } from '../src/editor/geometry';
import type { LayerBounds } from '../src/spec/shutterframe';

/** A 200×100 element whose centre is (300, 200), turned by `deg`. */
function bounds(deg = 0): LayerBounds {
  const box = { x: 200, y: 150, w: 200, h: 100 };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const cos = Math.abs(Math.cos((deg * Math.PI) / 180));
  const sin = Math.abs(Math.sin((deg * Math.PI) / 180));
  const aw = box.w * cos + box.h * sin;
  const ah = box.w * sin + box.h * cos;
  return { x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah, cx, cy, box, rotation: deg };
}

describe('canvas handles', () => {
  it('puts the rotation grip above the top edge of the selection', () => {
    const b = bounds(0);
    const pts = handlePoints(b, 1);
    expect(pts.rotate.x).toBeCloseTo(300, 5);
    expect(pts.rotate.y).toBeCloseTo(150 - 34, 5);
    expect(pts.se).toEqual({ x: 400, y: 250 });
  });

  it('gives a finger a real target on every corner and the grip', () => {
    const b = bounds(0);
    expect(hitHandle({ x: 300, y: 110 }, b, 1)).toBe('rotate');
    expect(hitHandle({ x: 402, y: 252 }, b, 1)).toBe('se');
    expect(hitHandle({ x: 198, y: 148 }, b, 1)).toBe('nw');
    expect(hitHandle({ x: 300, y: 200 }, b, 1)).toBeNull();
    /* the grips grow on a zoomed-out plate so 32px of screen stays 32px */
    expect(hitHandle({ x: 300, y: 200 - 60 }, b, 0.5)).toBeNull();
    expect(hitHandle({ x: 300, y: 150 - 68 - 30 }, b, 0.5)).toBe('rotate');
  });

  it('follows a turned element', () => {
    const b = bounds(90);
    const pts = handlePoints(b, 1);
    /* the local top-right corner (400,150) turns to (350,300) around (300,200) */
    expect(pts.ne.x).toBeCloseTo(350, 5);
    expect(pts.ne.y).toBeCloseTo(300, 5);
    expect(hitHandle({ x: pts.rotate.x, y: pts.rotate.y }, b, 1)).toBe('rotate');
  });
});

describe('resize', () => {
  it('grows a box from the corner opposite the finger', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(resizeBox(rect, 0, 'se', { x: 300, y: 250 })).toEqual({ x: 0, y: 0, w: 300, h: 250 });
    expect(resizeBox(rect, 0, 'nw', { x: -40, y: -20 })).toEqual({ x: -40, y: -20, w: 140, h: 120 });
  });

  it('keeps the opposite corner exactly where it was, even when turned', () => {
    const rect = { x: 200, y: 150, w: 200, h: 100 };
    const rotation = 90;
    const next = resizeBox(rect, rotation, 'se', { x: 480, y: 330 });
    const anchorBefore = rotatePoint(200, 150, 300, 200, rotation);
    const anchorAfter = rotatePoint(next.x, next.y, next.x + next.w / 2, next.y + next.h / 2, rotation);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 5);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 5);
    expect(next.w).toBeGreaterThan(200);
  });

  it('never lets a corner shrink the box into nothing', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(resizeBox(rect, 0, 'se', { x: 2, y: 3 }).w).toBe(16);
    expect(resizeBox(rect, 0, 'se', { x: -50, y: -50 }).w).toBe(50);
  });
});

describe('rotation snapping', () => {
  it('lands on 45° when a finger is within four degrees of it', () => {
    expect(snapAngle(43, 45, 4)).toEqual({ value: 45, snapped: true });
    expect(snapAngle(-2, 45, 4)).toEqual({ value: 0, snapped: true });
    expect(snapAngle(30, 45, 4)).toEqual({ value: 30, snapped: false });
    expect(snapAngle(92, 45, 4).value).toBe(90);
  });
});

describe('magnet guides', () => {
  it('pulls an element to the frame centre line', () => {
    /* centre at 597, three pixels off the 600 centre line */
    const b = { ...bounds(0), x: 497, y: 150, w: 200, h: 100 };
    const snap = snapMove(b, [], { w: 1200, h: 1800 }, 1);
    expect(snap.dx).toBeCloseTo(3, 5);
    expect(snap.guides.v).toContain(600);
  });

  it('leaves a far element alone', () => {
    const b = { ...bounds(0), x: 900, y: 1200, w: 200, h: 100 };
    const snap = snapMove(b, [], { w: 1200, h: 1800 }, 1);
    expect(snap.dx).toBe(0);
    expect(snap.dy).toBe(0);
  });
});
