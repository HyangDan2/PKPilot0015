import type { LayerBounds } from '../spec/shutterframe';

export interface Point { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }
export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export type Handle = Corner | 'rotate';

export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

/** A point turned around (cx, cy) by `deg` degrees. */
export function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number): Point {
  if (!deg) return { x: px, y: py };
  const rad = (deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 0, 45, 90 … so a finger never lands on 43.2°. */
export function snapAngle(deg: number, step = 45, tolerance = 5): { value: number; snapped: boolean } {
  const wrapped = ((deg % 360) + 360) % 360;
  const near = Math.round(wrapped / step) * step;
  const delta = Math.min(Math.abs(wrapped - near), Math.abs(wrapped - 360 - near));
  if (delta <= tolerance) return { value: ((near % 360) + 540) % 360 - 180, snapped: true };
  return { value: deg, snapped: false };
}

/** The four corners and the rotation grip, already turned by the element. */
export function handlePoints(b: LayerBounds, scale: number): Record<Handle, Point> {
  const { x, y, w, h } = b.box;
  const off = 34 / Math.max(scale, 0.05);
  return {
    nw: rotatePoint(x, y, b.cx, b.cy, b.rotation),
    ne: rotatePoint(x + w, y, b.cx, b.cy, b.rotation),
    sw: rotatePoint(x, y + h, b.cx, b.cy, b.rotation),
    se: rotatePoint(x + w, y + h, b.cx, b.cy, b.rotation),
    rotate: rotatePoint(b.cx, y - off, b.cx, b.cy, b.rotation),
  };
}

/** A fingertip-sized target on the canvas: ~32px on screen, whatever the zoom. */
export function hitHandle(pt: Point, b: LayerBounds, scale: number): Handle | null {
  const grip = 18 / Math.max(scale, 0.05);
  const points = handlePoints(b, scale);
  if (Math.hypot(pt.x - points.rotate.x, pt.y - points.rotate.y) <= grip + 6 / scale) return 'rotate';
  let best: Handle | null = null;
  let bestD = Infinity;
  CORNERS.forEach((corner) => {
    const d = Math.max(Math.abs(pt.x - points[corner].x), Math.abs(pt.y - points[corner].y));
    if (d <= grip && d < bestD) { best = corner; bestD = d; }
  });
  return best;
}

/**
 * Grows or shrinks a (possibly rotated) box by one corner. The corner opposite
 * the one being dragged stays exactly where it is on the frame.
 */
export function resizeBox(rect: Box, rotation: number, corner: Corner, pt: Point): Box {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const local = rotatePoint(pt.x, pt.y, cx, cy, -rotation);
  const east = corner === 'ne' || corner === 'se';
  const south = corner === 'sw' || corner === 'se';
  const anchorX = east ? rect.x : rect.x + rect.w;
  const anchorY = south ? rect.y : rect.y + rect.h;
  const w = Math.max(16, Math.abs(local.x - anchorX));
  const h = Math.max(16, Math.abs(local.y - anchorY));
  const x = east ? anchorX : anchorX - w;
  const y = south ? anchorY : anchorY - h;
  const anchorWorld = rotatePoint(anchorX, anchorY, cx, cy, rotation);
  const movedAnchor = rotatePoint(anchorX, anchorY, x + w / 2, y + h / 2, rotation);
  return {
    x: x + (anchorWorld.x - movedAnchor.x),
    y: y + (anchorWorld.y - movedAnchor.y),
    w,
    h,
  };
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: { v: number[]; h: number[] };
}

/**
 * Magnet pull toward the frame's centre lines and the other elements' edges.
 * `others` are the axis-aligned boxes the dragged element must not ignore.
 */
export function snapMove(box: LayerBounds, others: Box[], frame: { w: number; h: number }, scale: number): SnapResult {
  const tolerance = 7 / Math.max(scale, 0.05);
  const xs = [0, frame.w / 2, frame.w];
  const ys = [0, frame.h / 2, frame.h];
  others.forEach((o) => {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  });
  const guides: { v: number[]; h: number[] } = { v: [], h: [] };
  const edgesX = [box.x, box.x + box.w / 2, box.x + box.w];
  const edgesY = [box.y, box.y + box.h / 2, box.y + box.h];
  let dx = 0;
  let bestX = tolerance + 1;
  edgesX.forEach((edge) => {
    xs.forEach((line) => {
      const d = Math.abs(edge - line);
      if (d < bestX && d <= tolerance) {
        bestX = d;
        dx = line - edge;
        guides.v = [line];
      }
    });
  });
  let dy = 0;
  let bestY = tolerance + 1;
  edgesY.forEach((edge) => {
    ys.forEach((line) => {
      const d = Math.abs(edge - line);
      if (d < bestY && d <= tolerance) {
        bestY = d;
        dy = line - edge;
        guides.h = [line];
      }
    });
  });
  return { dx, dy, guides };
}
