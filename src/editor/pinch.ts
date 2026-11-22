import type { Point } from './geometry';
import { sameSelection, type Selection } from './selection';

/**
 * Who owns a two-finger gesture. Only a layer that is already chosen can be
 * taken by two fingers, and only where they land on it — under the first
 * finger, between the two, or in the hand that had already taken it up — so a
 * pinch over a photograph is the glass's zoom instead of a surprise grab of a
 * frame nobody had picked. `null` means the viewport owns the pinch.
 */
export function pinchTarget(
  selected: Selection,
  grabbed: Selection,
  fingers: Point[],
  onLayer: (layer: Exclude<Selection, null>, point: Point) => boolean,
): Exclude<Selection, null> | null {
  const current = selected && selected.kind !== 'overlay' ? selected : null;
  if (!current) return null;
  /* a drag the first finger had begun on the chosen layer keeps it */
  if (grabbed) return sameSelection(grabbed, current) ? current : null;
  const first = fingers[0];
  if (!first) return null;
  if (onLayer(current, first)) return current;
  const second = fingers[1];
  if (!second) return null;
  return onLayer(current, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }) ? current : null;
}
