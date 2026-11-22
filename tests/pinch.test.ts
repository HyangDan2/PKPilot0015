import { describe, expect, it } from 'vitest';
import { pinchTarget } from '../src/editor/pinch';
import type { Selection } from '../src/editor/selection';

/**
 * Who two fingers belong to. The studio's rule is a choice made on purpose:
 * a frame nobody selected is never taken by a pinch, so a hand that only meant
 * to look closer zooms the plate instead.
 */

const slot: Selection = { kind: 'cell', index: 0 };
const otherSlot: Selection = { kind: 'cell', index: 1 };

/** A layer that fills 100–300 × 100–300 design units. */
const onBox = (point: { x: number; y: number }) =>
  point.x >= 100 && point.x <= 300 && point.y >= 100 && point.y <= 300;

const asked: string[] = [];
const onLayer = (layer: Exclude<Selection, null>, point: { x: number; y: number }) => {
  asked.push(`${layer.kind}:${JSON.stringify(point)}`);
  return onBox(point);
};

describe('two fingers pick only the layer that is already chosen', () => {
  it('leaves the pinch to the viewport when nothing is selected', () => {
    expect(pinchTarget(null, null, [{ x: 200, y: 200 }, { x: 260, y: 200 }], onLayer)).toBeNull();
    /* not even a hit test is made: the glass owns the fingers outright */
    expect(asked).toEqual([]);
  });

  it('leaves an overlay-only selection to the viewport', () => {
    expect(pinchTarget({ kind: 'overlay' }, null, [{ x: 200, y: 200 }, { x: 260, y: 200 }], onLayer)).toBeNull();
  });

  it('takes the chosen layer when the first finger lands on it', () => {
    expect(pinchTarget(slot, null, [{ x: 200, y: 200 }, { x: 500, y: 200 }], onLayer)).toEqual(slot);
  });

  it('takes it when the two fingers straddle it, even with the first on the margin', () => {
    expect(pinchTarget(slot, null, [{ x: 90, y: 200 }, { x: 180, y: 200 }], onLayer)).toEqual(slot);
  });

  it('keeps the layer a finger had already begun to drag', () => {
    expect(pinchTarget(slot, slot, [{ x: 20, y: 20 }, { x: 40, y: 40 }], onLayer)).toEqual(slot);
  });

  it('lets the viewport go when the fingers land on some other layer', () => {
    expect(pinchTarget(slot, null, [{ x: 500, y: 500 }, { x: 560, y: 500 }], onLayer)).toBeNull();
    /* the chosen layer is the only one ever probed */
    expect(asked.every((entry) => entry.startsWith('cell:'))).toBe(true);
  });

  it('lets the viewport go when a drag holds something other than the choice', () => {
    expect(pinchTarget(slot, otherSlot, [{ x: 200, y: 200 }, { x: 260, y: 200 }], onLayer)).toBeNull();
  });
});
