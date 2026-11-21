/**
 * Typed face of the shared `public/shutterframe.js` engine. The engine itself is
 * one classic script the three apps load, so the spec, the validator, the
 * painter and the share codec can never drift between Mynda Ljósa,
 * Shutterplate and Nordlys.
 */

export interface FrameGradient {
  type: 'linear';
  angle: number;
  stops: [string, string];
}

export interface FrameCanvas {
  width: number;
  height: number;
  background: string;
  gradient?: FrameGradient;
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
  /** Layer visibility in the editor and in the two host apps. */
  visible?: boolean;
}

export interface FrameEmblem {
  enabled: boolean;
  x: number;
  y: number;
  maxW: number;
  maxH: number;
  align: FrameAlign;
  mode: 'auto' | 'light' | 'dark';
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
  custom: { spec: ShutterFrameSpec; slots: FrameSlot[]; fields: FrameFields; scale: number };
}

export interface ValidationResult {
  ok: boolean;
  spec: ShutterFrameSpec | null;
  errors: string[];
  warnings: string[];
}

interface ShutterFrameApi {
  SCHEMA: string;
  VAR_NAMES: string[];
  FONTS: Record<FrameFamily, string>;
  helpers: {
    roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;
    drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, x: number, y: number, cw: number, ch: number): void;
  };
  validate(raw: unknown): ValidationResult;
  parse(raw: unknown): ValidationResult;
  clone(spec: ShutterFrameSpec): ShutterFrameSpec;
  touch(spec: ShutterFrameSpec, patch: Partial<ShutterFrameSpec>): ShutterFrameSpec;
  uid(prefix?: string): string;
  encode(spec: ShutterFrameSpec): string;
  decode(text: string): ShutterFrameSpec | null;
  fromUrl(href?: string): ShutterFrameSpec | null;
  shareUrl(base: string, spec: ShutterFrameSpec): string;
  buildVars(spec: ShutterFrameSpec, fields: FrameFields): Record<string, string>;
  applyVars(text: string, vars: Record<string, string>): string;
  formatDate(value: string): string;
  layout(spec: ShutterFrameSpec, opts?: { scale?: number; slots?: FrameSlot[]; fields?: FrameFields }): CustomLayout;
  paint(ctx: CanvasRenderingContext2D, layout: CustomLayout): boolean;
  primeOverlay(spec: ShutterFrameSpec): Promise<ShutterFrameSpec>;
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
