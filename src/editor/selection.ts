/** What the canvas and the properties panel are editing right now. */
export type Selection =
  | { kind: 'cell'; index: number }
  | { kind: 'text'; id: string }
  | { kind: 'sticker'; id: string }
  | { kind: 'emblem' }
  | { kind: 'overlay' }
  | null;

export function sameSelection(a: Selection, b: Selection): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cell' && b.kind === 'cell') return a.index === b.index;
  if ((a.kind === 'text' && b.kind === 'text') || (a.kind === 'sticker' && b.kind === 'sticker')) return a.id === b.id;
  return true;
}
