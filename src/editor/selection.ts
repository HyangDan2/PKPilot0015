/** What the canvas and the properties panel are editing right now. */
export type Selection =
  | { kind: 'cell'; index: number }
  | { kind: 'text'; id: string }
  | { kind: 'emblem' }
  | { kind: 'overlay' }
  | null;
