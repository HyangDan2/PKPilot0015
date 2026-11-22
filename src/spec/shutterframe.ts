/**
 * Typed face of the shared `public/shutterframe.js` engine. The engine itself is
 * one classic script the three apps load, so the spec, the validator, the
 * painter and the share codec can never drift between FrameBuilder,
 * Shutterplate and Nordlys.
 *
 * v1 documents written before the touch editor still load unchanged: `rotation`
 * and `z` default to 0 / the legacy order and `stickers` is simply empty.
 */

export interface FrameGradient {
  type: 'linear';
  angle: number;
  stops: [string, string];
}

export interface FrameBackgroundImage {
  dataUrl: string;
  opacity: number;
}

export interface FrameCanvas {
  width: number;
  height: number;
  background: string;
  gradient?: FrameGradient;
  /** A photograph cropped in the editor, painted over the colour/gradient. */
  backgroundImage?: FrameBackgroundImage;
  light: boolean;
}

export interface FramePerforation {
  enabled: boolean;
  style: 'side' | 'film';
  color: string;
  holeWidth: number;
  holeHeight: number;
  gap: number;
}

export interface FrameCell {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  /** Degrees around the cell's own centre. */
  rotation?: number;
  /** Layer order in the shared stack; omitted keeps the legacy order. */
  z?: number;
}

export interface FrameOverlay {
  dataUrl: string;
  layer: 'above' | 'below';
  opacity: number;
}

export type FrameFamily = 'sans' | 'serif' | 'mono';
export type FrameAlign = 'left' | 'center' | 'right';

export interface FrameText {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  family: FrameFamily;
  weight: number;
  align: FrameAlign;
  color: string;
  letterSpacing: number;
  rotation?: number;
  z?: number;
  /** Layer visibility in the editor and in the two host apps. */
  visible?: boolean;
}

export interface FrameEmblem {
  enabled: boolean;
  /** Which maker's mark prints — `hd2lab` (the house dual-skew) by default. */
  id?: string;
  /** false prints each maker's own colour, true prints one ink (All Black). */
  mono?: boolean;
  x: number;
  y: number;
  maxW: number;
  maxH: number;
  align: FrameAlign;
  mode: 'auto' | 'light' | 'dark';
  rotation?: number;
  z?: number;
}

/** One entry of the emblem catalogue the engine draws with Path2D. */
export interface EmblemInfo {
  id: string;
  name: string;
}

export type StickerKind = 'stripe' | 'sprite';

export interface FrameSticker {
  id: string;
  kind: StickerKind;
  /** One of the engine's stripe presets, for `kind: 'stripe'`. */
  preset?: string;
  label?: string;
  color: string;
  color2: string;
  opacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z?: number;
  visible?: boolean;
  /** The uploaded transparent PNG/SVG/WebP for `kind: 'sprite'`. */
  dataUrl?: string;
}

export interface ShutterFrameSpec {
  schema: 'shutterframe/v1';
  id: string;
  name: string;
  author?: string;
  updatedAt: string;
  canvas: FrameCanvas;
  perforation: FramePerforation;
  cells: FrameCell[];
  overlay?: FrameOverlay;
  stickers?: FrameSticker[];
  texts: FrameText[];
  emblem: FrameEmblem;
}

export interface FrameFields {
  date?: string;
  datetime?: string;
  camera?: string;
  make?: string;
  model?: string;
  lens?: string;
  film?: string;
  title?: string;
  caption?: string;
  shutter?: string;
  iso?: string;
  aperture?: string;
}

export interface FrameSlot {
  img: CanvasImageSource | null;
  w: number;
  h: number;
}

export interface CustomLayout {
  style: string;
  W: number;
  H: number;
  colors: { base: string; light: boolean; ink: string };
  radius: number;
  multi: true;
  cells: { x: number; y: number; w: number; h: number }[];
  custom: {
    spec: ShutterFrameSpec;
    slots: FrameSlot[];
    fields: FrameFields;
    scale: number;
    onNeedAssets?: (spec: ShutterFrameSpec) => void;
  };
}

export interface ValidationResult {
  ok: boolean;
  spec: ShutterFrameSpec | null;
  errors: string[];
  warnings: string[];
}

/** A reference to one element of the frame, the same key the layer table uses. */
export type LayerRef =
  | { kind: 'cell'; index: number }
  | { kind: 'text'; id: string }
  | { kind: 'sticker'; id: string }
  | { kind: 'emblem' };

export interface LayerRow {
  key: string;
  kind: 'cell' | 'text' | 'sticker' | 'emblem' | 'overlay';
  id?: string;
  index?: number;
  z: number;
  rotation: number;
  visible: boolean;
  label: string;
}

/** One element's own box, its centre and the axis-aligned box it covers. */
export interface LayerBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  box: { x: number; y: number; w: number; h: number };
  rotation: number;
}

export type AlignMode = 'h-center' | 'v-center' | 'left' | 'right' | 'top' | 'bottom';

export interface StickerPresetInfo {
  id: string;
  label: string;
}

interface ShutterFrameApi {
  SCHEMA: string;
  VAR_NAMES: string[];
  FONTS: Record<FrameFamily, string>;
  STICKER_PRESETS: Record<string, { label: string; draw: (ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, opts: { color: string; color2: string }) => void }>;
  helpers: {
    roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;
    drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, x: number, y: number, cw: number, ch: number): void;
    drawContain(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, cw: number, ch: number): void;
    fillBackground(ctx: CanvasRenderingContext2D, spec: ShutterFrameSpec, W: number, H: number): void;
    turnAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, deg: number): void;
  };
  validate(raw: unknown): ValidationResult;
  parse(raw: unknown): ValidationResult;
  clone(spec: ShutterFrameSpec): ShutterFrameSpec;
  touch(spec: ShutterFrameSpec, patch: Partial<ShutterFrameSpec>): ShutterFrameSpec;
  uid(prefix?: string): string;
  serialize(spec: ShutterFrameSpec): string;
  encode(spec: ShutterFrameSpec): string;
  decode(text: string): ShutterFrameSpec | null;
  fromUrl(href?: string): ShutterFrameSpec | null;
  shareUrl(base: string, spec: ShutterFrameSpec): string;
  buildVars(spec: ShutterFrameSpec, fields: FrameFields): Record<string, string>;
  applyVars(text: string, vars: Record<string, string>): string;
  formatDate(value: string): string;
  layout(spec: ShutterFrameSpec, opts?: { scale?: number; slots?: FrameSlot[]; fields?: FrameFields; onNeedAssets?: (spec: ShutterFrameSpec) => void }): CustomLayout;
  paint(ctx: CanvasRenderingContext2D, layout: CustomLayout): boolean;
  paintTo(canvas: HTMLCanvasElement, spec: ShutterFrameSpec, opts?: { scale?: number; slots?: FrameSlot[]; fields?: FrameFields }): CustomLayout | null;
  primeAssets(spec: ShutterFrameSpec): Promise<ShutterFrameSpec>;
  primeOverlay(spec: ShutterFrameSpec): Promise<ShutterFrameSpec>;
  onAssetsLoaded(fn: () => void): () => void;
  stickerPresets(): StickerPresetInfo[];
  drawStickerPreset(ctx: CanvasRenderingContext2D, preset: string, box: { x: number; y: number; w: number; h: number }, opts?: { color?: string; color2?: string }): void;
  layers(spec: ShutterFrameSpec): LayerRow[];
  paintOrder(spec: ShutterFrameSpec): LayerRow[];
  moveLayer(spec: ShutterFrameSpec, ref: LayerRef, dir: number): ShutterFrameSpec;
  setZ(spec: ShutterFrameSpec, ref: LayerRef, z: number): ShutterFrameSpec;
  depthOf(spec: ShutterFrameSpec, ref: LayerRef): { index: number; count: number } | null;
  boundsOf(spec: ShutterFrameSpec, ref: LayerRef, measure?: (t: FrameText, content: string) => number): LayerBounds | null;
  hitLayer(spec: ShutterFrameSpec, ref: LayerRef, pt: { x: number; y: number }, measure?: (t: FrameText, content: string) => number): boolean;
  alignLayer(spec: ShutterFrameSpec, ref: LayerRef, mode: AlignMode, box?: LayerBounds): ShutterFrameSpec;
  translate(spec: ShutterFrameSpec, ref: LayerRef, dx: number, dy: number): ShutterFrameSpec;
  resetLayers(spec: ShutterFrameSpec): ShutterFrameSpec;
  emblemList(): EmblemInfo[];
  emblemOf(id: string): { id: string; name: string; vb: [number, number] };
  emblemBox(emblem: FrameEmblem): { x: number; y: number; w: number; h: number };
  addSticker(spec: ShutterFrameSpec, preset: string, patch?: Partial<FrameSticker>): ShutterFrameSpec;
  addSprite(spec: ShutterFrameSpec, dataUrl: string, patch?: Partial<FrameSticker>): ShutterFrameSpec;
  addEmblem(spec: ShutterFrameSpec, patch?: Partial<FrameEmblem>): ShutterFrameSpec;
  removeLayer(spec: ShutterFrameSpec, ref: LayerRef): ShutterFrameSpec;
  alignCells(spec: ShutterFrameSpec, kind: '1x4' | '2x2', margin?: number, gutter?: number): ShutterFrameSpec;
  summary(spec: ShutterFrameSpec): string;
  store: {
    list(): Promise<ShutterFrameSpec[]>;
    get(id: string): Promise<ShutterFrameSpec | null>;
    put(spec: ShutterFrameSpec): Promise<ShutterFrameSpec>;
    remove(id: string): Promise<boolean>;
    clear(): Promise<boolean>;
  };
}

declare global {
  interface Window {
    ShutterFrame?: ShutterFrameApi;
    LZString?: {
      compressToEncodedURIComponent(value: string): string;
      decompressFromEncodedURIComponent(value: string): string | null;
    };
  }
}

export const SCHEMA = 'shutterframe/v1';

export function sf(): ShutterFrameApi {
  const api = typeof window !== 'undefined' ? window.ShutterFrame : undefined;
  if (!api) throw new Error('ShutterFrame engine is not loaded.');
  return api;
}

export function hasEngine(): boolean {
  return typeof window !== 'undefined' && !!window.ShutterFrame;
}

/** Loads the shared engine if index.html has not already done it. */
export async function loadEngine(): Promise<ShutterFrameApi> {
  if (hasEngine()) return sf();
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}shutterframe.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load shutterframe.js'));
    document.head.appendChild(script);
  });
  return sf();
}

/** The ref a `Selection` maps to, for the engine's layer helpers. */
export function layerRef(selection: Exclude<import('../editor/selection').Selection, null>): LayerRef | null {
  if (selection.kind === 'cell') return { kind: 'cell', index: selection.index };
  if (selection.kind === 'text') return { kind: 'text', id: selection.id };
  if (selection.kind === 'sticker') return { kind: 'sticker', id: selection.id };
  if (selection.kind === 'emblem') return { kind: 'emblem' };
  return null;
}
