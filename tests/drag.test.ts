import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { moveLayer, pinchLayer, resizeLayer } from '../src/editor/drag';
import type { FrameText, ShutterFrameSpec } from '../src/spec/shutterframe';
import type { Selection } from '../src/editor/selection';
import type { Box } from '../src/editor/geometry';

type Target = Exclude<Selection, null>;

function baseSpec(): ShutterFrameSpec {
  return {
    schema: 'shutterframe/v1',
    id: 'frame-drag',
    name: 'Drag test',
    updatedAt: '2026-11-21T00:00:00.000Z',
    canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true },
    perforation: { enabled: false, style: 'side', color: '#e9e4d8', holeWidth: 8, holeHeight: 10, gap: 12 },
    cells: [{ x: 36, y: 96, w: 528, h: 380, radius: 4 }],
    stickers: [{ id: 's1', kind: 'stripe', preset: 'thin', color: '#111111', color2: '#ffffff', opacity: 1, x: 40, y: 40, w: 120, h: 30, rotation: 0 }],
    texts: [{ id: 't1', text: '{{date}}', x: 300, y: 1740, size: 20, family: 'sans', weight: 500, align: 'center', color: '#6b635a', letterSpacing: 0 }],
    emblem: { enabled: true, x: 300, y: 1700, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
  };
}

const copy = (spec: ShutterFrameSpec): ShutterFrameSpec => JSON.parse(JSON.stringify(spec));

const TARGETS: Target[] = [
  { kind: 'cell', index: 0 },
  { kind: 'text', id: 't1' },
  { kind: 'sticker', id: 's1' },
  { kind: 'emblem' },
];

function origin(spec: ShutterFrameSpec, target: Target): { x: number; y: number } {
  if (target.kind === 'cell') return { x: spec.cells[0].x, y: spec.cells[0].y };
  if (target.kind === 'text') return { x: spec.texts[0].x, y: spec.texts[0].y };
  if (target.kind === 'sticker') return { x: spec.stickers![0].x, y: spec.stickers![0].y };
  return { x: spec.emblem.x, y: spec.emblem.y };
}

/**
 * Replays one gesture the way the editor does: `base` is frozen at pointerdown
 * and the very same `next` is fed back into the next frame (App state is the
 * shallow copy `onSpecChange` received). 15 pointermove frames, 40px in total.
 */
function dragFrames(spec: ShutterFrameSpec, target: Target, totalX: number, totalY: number, steps = 15) {
  const base = copy(spec);
  let next = copy(spec);
  const frames: { x: number; y: number }[] = [];
  for (let frame = 1; frame <= steps; frame += 1) {
    const dx = (totalX * frame) / steps;
    const dy = (totalY * frame) / steps;
    moveLayer(target, base, next, dx, dy);
    next = { ...next }; /* what StageCanvas hands to onSpecChange each frame */
    frames.push(origin(next, target));
  }
  return { base, next, frames };
}

describe('a straight drag is measured from where the finger landed', () => {
  it.each(TARGETS.map((target) => [target.kind, target] as const))(
    '15 frames and 40px move a %s by 40px, not by the frame count',
    (_kind, target) => {
      const spec = baseSpec();
      const start = origin(spec, target);
      const { next, frames } = dragFrames(spec, target, 40, 20);
      const end = origin(next, target);

      expect(end.x).toBe(start.x + 40);
      expect(end.y).toBe(start.y + 20);

      /* every frame stays where the pointer is: no frame overshoots the gesture */
      frames.forEach((frame, index) => {
        const step = index + 1;
        expect(Math.abs(frame.x - (start.x + (40 * step) / 15))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(frame.y - (start.y + (20 * step) / 15))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(frame.x - start.x)).toBeLessThanOrEqual(40.5);
      });
    },
  );

  it('keeps a slow 60-frame drag on the plate', () => {
    const spec = baseSpec();
    const start = origin(spec, { kind: 'cell', index: 0 });
    const { next } = dragFrames(spec, { kind: 'cell', index: 0 }, 90, 0, 60);
    expect(next.cells[0].x).toBe(start.x + 90);
    expect(next.cells[0].x).toBeLessThan(spec.canvas.width);
  });

  it('leaves the other layers where they were', () => {
    const spec = baseSpec();
    const { next } = dragFrames(spec, { kind: 'text', id: 't1' }, 40, 0);
    expect(next.cells[0]).toEqual(spec.cells[0]);
    expect(next.emblem).toEqual(spec.emblem);
    expect(next.texts[0].size).toBe(spec.texts[0].size);
  });
});

describe('a pinch scales from the distance the second finger landed', () => {
  const steps = 12;
  const endRatio = 2;

  function pinchFrames(spec: ShutterFrameSpec, target: Target, box: Box) {
    const base = copy(spec);
    let next = copy(spec);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const sizes: number[] = [];
    for (let frame = 1; frame <= steps; frame += 1) {
      const ratio = 1 + ((endRatio - 1) * frame) / steps;
      const rect = { x: cx - (box.w * ratio) / 2, y: cy - (box.h * ratio) / 2, w: box.w * ratio, h: box.h * ratio };
      pinchLayer(target, base, next, ratio, rect);
      next = { ...next };
      if (target.kind === 'text') sizes.push(next.texts[0].size);
      if (target.kind === 'emblem') sizes.push(next.emblem.maxW);
      if (target.kind === 'cell') sizes.push(next.cells[0].w);
    }
    return { next, sizes };
  }

  it('grows a cell by the pinch ratio once', () => {
    const spec = baseSpec();
    const box = { x: 36, y: 96, w: 528, h: 380 };
    const { next, sizes } = pinchFrames(spec, { kind: 'cell', index: 0 }, box);
    expect(next.cells[0].w).toBe(1056);
    expect(next.cells[0].h).toBe(760);
    sizes.forEach((w, index) => {
      expect(Math.abs(w - 528 * (1 + (endRatio - 1) * ((index + 1) / steps)))).toBeLessThanOrEqual(1);
    });
  });

  it('grows a text to exactly twice its size', () => {
    const spec = baseSpec();
    const box = { x: 240, y: 1720, w: 120, h: 30 };
    const { next, sizes } = pinchFrames(spec, { kind: 'text', id: 't1' }, box);
    expect(next.texts[0].size).toBeCloseTo(40, 6);
    sizes.forEach((size, index) => {
      expect(size).toBeLessThanOrEqual(20 * (1 + (endRatio - 1) * ((index + 1) / steps)) + 1e-9);
    });
  });

  it('grows the emblem to exactly twice its maximum', () => {
    const spec = baseSpec();
    const box = { x: 190, y: 1680, w: 220, h: 40 };
    const { next } = pinchFrames(spec, { kind: 'emblem' }, box);
    expect(next.emblem.maxW).toBeCloseTo(440, 6);
    expect(next.emblem.maxH).toBeCloseTo(80, 6);
    expect(next.emblem.maxW).toBeLessThan(1000);
  });
});

describe('a corner grip resizes from the box the element started in', () => {
  const baseBox = { x: 190, y: 1680, w: 220, h: 40 };
  const measureWidth = (item: FrameText) => item.size * item.text.length * 0.55;

  function resizeFrames(spec: ShutterFrameSpec, target: Target, box: Box, endHeight: number, steps = 20) {
    const base = copy(spec);
    let next = copy(spec);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const sizes: number[] = [];
    for (let frame = 1; frame <= steps; frame += 1) {
      const ratio = 1 + ((endHeight / box.h - 1) * frame) / steps;
      const w = box.w * ratio;
      const h = box.h * ratio;
      const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
      resizeLayer(target, base, next, rect, box, measureWidth);
      next = { ...next };
      if (target.kind === 'text') sizes.push(next.texts[0].size);
      if (target.kind === 'emblem') sizes.push(next.emblem.maxW);
    }
    return { next, sizes };
  }

  it('doubles a text size over 20 frames instead of compounding it', () => {
    const spec = baseSpec();
    const box = { x: 250, y: 1725, w: 100, h: 30 };
    const { next, sizes } = resizeFrames(spec, { kind: 'text', id: 't1' }, box, 60);
    expect(next.texts[0].size).toBeCloseTo(40, 6);
    sizes.forEach((size, index) => {
      const ratio = 1 + (2 - 1) * ((index + 1) / 20);
      expect(size).toBeLessThanOrEqual(20 * ratio + 1e-9);
    });
  });

  it('doubles the emblem maxima over 20 frames', () => {
    const spec = baseSpec();
    const { next } = resizeFrames(spec, { kind: 'emblem' }, baseBox, 80);
    expect(next.emblem.maxW).toBeCloseTo(440, 6);
    expect(next.emblem.maxH).toBeCloseTo(80, 6);
    expect(next.emblem.maxH).toBeLessThan(1000);
  });
});

describe('the canvas wires every gesture through the base-relative helpers', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StageCanvas.tsx'), 'utf8');

  it('freezes an independent copy of the spec when a gesture begins', () => {
    /* `base: spec` kept a live reference; `sf().clone` is the deep copy that stays still */
    expect(source.match(/base: sf\(\)\.clone\(spec\)/g)?.length).toBe(2);
    expect(source).not.toMatch(/base: spec,/);
  });

  it('never adds a pointer delta to the frame it is already writing', () => {
    expect(source).toContain('moveLayer(target, state.base, state.next');
    expect(source).toContain('pinchLayer(state.target, state.base');
    expect(source).toContain('resizeLayer(target, state.base, state.next');
    expect(source).not.toContain('moveRef(');
    expect(source).not.toMatch(/state\.next\.emblem\.max[WH] = clamp\(state\.next\.emblem/);
  });
});
