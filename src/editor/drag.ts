/**
 * The plate's gesture maths, kept apart from the canvas component so a whole
 * drag can be replayed frame by frame in a test.
 *
 * One rule holds every function here together: a gesture reads its starting
 * value from `base` — a deep copy taken the moment the finger went down — and
 * writes an absolute result into `next`. The caller hands the same `next` back
 * on the following frame, so anything read from `next` would compound: a 40px
 * drag added to its own previous total 60 times a second throws the element
 * thousands of pixels off the plate.
 */
import type { FrameText, ShutterFrameSpec } from '../spec/shutterframe';
import type { Selection } from './selection';
import { clamp, type Box } from './geometry';

/** The selected element a gesture is acting on (never the overlay). */
export type DragTarget = Exclude<Selection, null>;

const textOf = (spec: ShutterFrameSpec, id: string) => spec.texts.find((row) => row.id === id);
const stickerOf = (spec: ShutterFrameSpec, id: string) => (spec.stickers ?? []).find((row) => row.id === id);
const MIN_SIZE = { cell: 16, sticker: 8 } as const;

/** A straight drag: the pointer's total offset from where it went down. */
export function moveLayer(
  target: DragTarget,
  base: ShutterFrameSpec,
  next: ShutterFrameSpec,
  dx: number,
  dy: number,
): void {
  if (target.kind === 'cell') {
    const from = base.cells[target.index];
    const to = next.cells[target.index];
    if (!from || !to) return;
    to.x = Math.round(from.x + dx);
    to.y = Math.round(from.y + dy);
    return;
  }
  if (target.kind === 'text') {
    const from = textOf(base, target.id);
    const to = textOf(next, target.id);
    if (!from || !to) return;
    to.x = Math.round(from.x + dx);
    to.y = Math.round(from.y + dy);
    return;
  }
  if (target.kind === 'sticker') {
    const from = stickerOf(base, target.id);
    const to = stickerOf(next, target.id);
    if (!from || !to) return;
    to.x = Math.round(from.x + dx);
    to.y = Math.round(from.y + dy);
    return;
  }
  if (target.kind !== 'emblem') return;
  next.emblem.x = Math.round(base.emblem.x + dx);
  next.emblem.y = Math.round(base.emblem.y + dy);
}

/**
 * Two fingers: `ratio` is the pinch distance measured against the distance
 * when the second finger landed, so every value below is the base value times
 * that one ratio — never the previous frame's value times it again.
 */
export function pinchLayer(
  target: DragTarget,
  base: ShutterFrameSpec,
  next: ShutterFrameSpec,
  ratio: number,
  rect: Box,
): void {
  if (target.kind === 'cell' || target.kind === 'sticker') {
    const min = MIN_SIZE[target.kind];
    const to = target.kind === 'cell' ? next.cells[target.index] : stickerOf(next, target.id);
    if (!to) return;
    to.x = Math.round(rect.x);
    to.y = Math.round(rect.y);
    to.w = Math.max(min, Math.round(rect.w));
    to.h = Math.max(min, Math.round(rect.h));
    return;
  }
  if (target.kind === 'text') {
    const from = textOf(base, target.id);
    const to = textOf(next, target.id);
    if (!from || !to) return;
    to.size = clamp(from.size * ratio, 6, 400);
    to.y = Math.round(rect.y + to.size * 0.82);
    return;
  }
  if (target.kind !== 'emblem') return;
  next.emblem.maxW = clamp(base.emblem.maxW * ratio, 8, 4000);
  next.emblem.maxH = clamp(base.emblem.maxH * ratio, 8, 4000);
  next.emblem.x = Math.round(rect.x + rect.w / 2);
  next.emblem.y = Math.round(rect.y + rect.h / 2);
}

/**
 * A corner grip: the box comes from `baseBox` (where the element started) and
 * the pointer's current place, so width and height are already absolute. What
 * grows with them — a text's size, the emblem's maxima — is the base value
 * times that same factor.
 */
export function resizeLayer(
  target: DragTarget,
  base: ShutterFrameSpec,
  next: ShutterFrameSpec,
  rect: Box,
  baseBox: Box,
  measureWidth: (item: FrameText) => number,
): void {
  if (target.kind === 'cell' || target.kind === 'sticker') {
    const min = MIN_SIZE[target.kind];
    const to = target.kind === 'cell' ? next.cells[target.index] : stickerOf(next, target.id);
    if (!to) return;
    to.x = Math.round(rect.x);
    to.y = Math.round(rect.y);
    to.w = Math.max(min, Math.round(rect.w));
    to.h = Math.max(min, Math.round(rect.h));
    return;
  }
  if (target.kind === 'text') {
    const from = textOf(base, target.id);
    const to = textOf(next, target.id);
    if (!from || !to) return;
    const ratio = rect.h / Math.max(1, baseBox.h);
    to.size = clamp(from.size * ratio, 6, 400);
    const width = measureWidth(to);
    to.y = Math.round(rect.y + to.size * 0.82);
    to.x = Math.round(to.align === 'left' ? rect.x : to.align === 'right' ? rect.x + width : rect.x + width / 2);
    return;
  }
  if (target.kind !== 'emblem') return;
  const ratioW = rect.w / Math.max(1, baseBox.w);
  const ratioH = rect.h / Math.max(1, baseBox.h);
  next.emblem.maxW = clamp(base.emblem.maxW * ratioW, 8, 4000);
  next.emblem.maxH = clamp(base.emblem.maxH * ratioH, 8, 4000);
  next.emblem.x = Math.round(rect.x + rect.w / 2);
  next.emblem.y = Math.round(rect.y + rect.h / 2);
}
