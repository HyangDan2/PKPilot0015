import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sf, layerRef, type FrameFields, type FrameSlot, type LayerBounds, type LayerRef, type ShutterFrameSpec } from '../spec/shutterframe';
import { useI18n } from '../i18n';
import type { Selection } from '../editor/selection';
import {
  clamp, handlePoints, hitHandle, resizeBox, snapAngle, snapMove,
  type Box, type Corner, type Handle, type Point,
} from '../editor/geometry';
import { moveLayer, pinchLayer, resizeLayer } from '../editor/drag';
import {
  clampPan, fitInsets, originOf, pinchAround, resolveScale, toDesignPoint, zoomAround,
  type Pan, type Size, type View,
} from '../editor/viewport';

export interface StageCanvasProps {
  spec: ShutterFrameSpec;
  slots: FrameSlot[];
  fields: FrameFields;
  selection: Selection;
  grid: boolean;
  /** The plate's own viewport: 20%–400% and a free X/Y pan. */
  view: View;
  onView: (next: View) => void;
  /** The scale the plate is actually drawn at, for the dock's readout. */
  onScale: (scale: number) => void;
  onSelect: (selection: Selection) => void;
  onSpecChange: (next: ShutterFrameSpec) => void;
  onSlotFile: (index: number, file: File) => void;
  /** The compact bar for the selected element, drawn over the plate. */
  overlay?: React.ReactNode;
}

type DragMode = 'move' | 'resize' | 'rotate' | 'pinch';

interface DragState {
  mode: DragMode;
  target: Exclude<Selection, null>;
  base: ShutterFrameSpec;
  next: ShutterFrameSpec;
  box: LayerBounds;
  start: Point;
  corner?: Corner;
  startAngle?: number;
  pinch?: { dist: number; angle: number; mid: Point; rotation: number };
  moved: boolean;
  startedAt: number;
  fromSelected: boolean;
}

/**
 * The moment between a finger landing and a gesture being certain: a finger
 * that lands on the selected layer is only a candidate drag, so a second
 * finger arriving quickly can still turn the whole thing into a viewport
 * pinch, and a finger that never moves is a tap that edits nothing.
 */
interface Pending {
  id: number;
  target: Exclude<Selection, null>;
  mode: Exclude<DragMode, 'pinch'>;
  box: LayerBounds;
  start: Point;
  startClient: Point;
  startedAt: number;
  corner?: Corner;
}

/** One finger on the glass, read three ways at once. */
interface Held {
  client: Point;
  local: Point;
  design: Point;
}

/** A gesture that moves the viewport rather than a layer on it. */
type ViewGesture =
  | { kind: 'pan'; id: number; start: Point; base: Pan; moved: boolean; tapToDeselect: boolean; tapSelect?: Exclude<Selection, null> }
  | { kind: 'pinch'; baseDist: number; scale: number; anchor: Point };

/** A finger must travel this far (px) before it is a drag rather than a tap. */
const PAN_THRESHOLD = 3;
/**
 * Two fingers that land within this window are always the viewport's pinch,
 * whatever the first one touched — reaching to zoom must never resize a photo.
 * Hold a selected layer longer than this and a second finger pinches the layer.
 */
const QUICK_PINCH_MS = 150;

/**
 * The plate, and a finger's whole vocabulary on it: tap to select, drag to
 * move (with magnet guides), corner grips to grow or shrink, the top grip to
 * turn, two fingers to pinch and twist. Nothing here needs an input box.
 *
 * The viewport is separate from those layers — wheel or two fingers zoom, an
 * empty spot or Space turns the glass itself — so a frame bigger than the
 * screen can be reached without touching what is painted on it.
 */
export function StageCanvas(props: StageCanvasProps) {
  const { t } = useI18n();
  const { spec, selection } = props;
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef(0);
  const drag = useRef<DragState | null>(null);
  const pending = useRef<Pending | null>(null);
  const held = useRef<Map<number, Held>>(new Map());
  const viewGesture = useRef<ViewGesture | null>(null);
  const spaceHeld = useRef(false);
  const [size, setSize] = useState({ w: 720, h: 640 });
  /* The box as the plate was last drawn in it — the reading a finger's maths
     should use, so a hit test can never be measured against a stale stage. */
  const liveBox = useRef({ w: 0, h: 0 });
  const lastScale = useRef<number | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [angleBadge, setAngleBadge] = useState<string | null>(null);

  useLayoutEffect(() => {
    const host = wrap.current;
    if (!host) return;
    const read = () => {
      const rect = host.getBoundingClientRect();
      setSize({ w: Math.max(120, Math.round(rect.width)), h: Math.max(160, Math.round(rect.height)) });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const designW = spec.canvas.width;
  const designH = spec.canvas.height;
  const design: Size = useMemo(() => ({ w: designW, h: designH }), [designW, designH]);
  const boxW = Math.max(120, Math.round(liveBox.current.w || size.w));
  const boxH = Math.max(160, Math.round(liveBox.current.h || size.h));
  const insetsFor = fitInsets(boxW);
  const scale = resolveScale(props.view.zoom, { w: boxW, h: boxH }, design, insetsFor);
  const shownOrigin = originOf(scale, props.view.pan, { w: boxW, h: boxH }, design, insetsFor);
  const vars = useMemo(() => sf().buildVars(spec, props.fields), [spec, props.fields]);

  /* the newest view, readable from a native listener or a gesture that spans
     several frames without waiting for a re-render */
  const viewRef = useRef<View>(props.view);
  useEffect(() => { viewRef.current = props.view; }, [props.view]);
  const onViewRef = useRef(props.onView);
  useEffect(() => { onViewRef.current = props.onView; }, [props.onView]);
  const designRef = useRef<Size>(design);
  useEffect(() => { designRef.current = design; }, [design]);

  const scaleRef = useRef(props.onScale);
  useEffect(() => { scaleRef.current = props.onScale; }, [props.onScale]);
  useEffect(() => { scaleRef.current(scale); }, [scale]);

  /* A zoom preset or a resized stage can leave a far pan pushing the plate out
     of reach; nudge it back to the last place a hand can still grab. */
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const cw = el.clientWidth || liveBox.current.w;
    const ch = el.clientHeight || liveBox.current.h;
    if (!cw || !ch) return;
    const stage: Size = { w: cw, h: ch };
    const insets = fitInsets(cw);
    const s = resolveScale(props.view.zoom, stage, design, insets);
    const reachable = clampPan(props.view.pan, s, stage, design, insets);
    if (Math.abs(reachable.x - props.view.pan.x) > 0.5 || Math.abs(reachable.y - props.view.pan.y) > 0.5) {
      props.onView({ zoom: props.view.zoom, pan: reachable });
    }
  }, [props.view, design, props.onView]);

  /* One measurer for hit testing, handles and the engine's own boxes. */
  const measure = useCallback((item: { size: number; weight: number; family: string; letterSpacing: number }, content: string) => {
    const ctx = canvas.current?.getContext('2d');
    const text = content || '';
    if (!ctx) return Math.max(12, text.length * item.size * 0.56);
    ctx.save();
    ctx.font = `${item.weight} ${item.size}px ${sf().FONTS[item.family as 'sans' | 'serif' | 'mono'] ?? sf().FONTS.sans}`;
    const width = ctx.measureText(text).width + (item.letterSpacing ? Math.abs(item.letterSpacing) * text.length : 0);
    ctx.restore();
    return width;
  }, []);

  const boundsOf = useCallback((s: ShutterFrameSpec, sel: Exclude<Selection, null>): LayerBounds | null => {
    const ref = layerRef(sel);
    if (!ref) return null;
    return sf().boundsOf(s, { ...ref, vars } as LayerRef & { vars: Record<string, string> }, measure);
  }, [measure, vars]);

  const othersOf = useCallback((s: ShutterFrameSpec, target: Selection): Box[] => {
    const key = target ? layerRef(target) : null;
    const selfKey = key ? (key.kind === 'cell' ? `cell:${key.index}` : key.kind === 'text' ? `text:${key.id}` : key.kind === 'sticker' ? `sticker:${key.id}` : 'emblem') : '';
    const boxes: Box[] = [];
    sf().paintOrder(s).forEach((row) => {
      if (row.key === selfKey || row.kind === 'overlay') return;
      const ref: LayerRef = row.kind === 'cell'
        ? { kind: 'cell', index: row.index ?? 0 }
        : row.kind === 'emblem'
          ? { kind: 'emblem' }
          : { kind: row.kind as 'text' | 'sticker', id: row.id ?? '' };
      const b = sf().boundsOf(s, { ...ref, vars } as LayerRef & { vars: Record<string, string> }, measure);
      if (b) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    });
    return boxes;
  }, [measure, vars]);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    /* the element's own box, not the last ResizeObserver reading: a box that
       changed without the observer catching up used to leave stale bands and
       a plate drawn at the wrong fit */
    const cw = Math.max(1, Math.round(el.clientWidth || size.w));
    const ch = Math.max(1, Math.round(el.clientHeight || size.h));
    if (el.width !== Math.round(cw * dpr) || el.height !== Math.round(ch * dpr)) {
      el.width = Math.round(cw * dpr);
      el.height = Math.round(ch * dpr);
    }
    liveBox.current = { w: cw, h: ch };
    if (Math.abs(cw - size.w) > 1 || Math.abs(ch - size.h) > 1) setSize({ w: cw, h: ch });
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const stage: Size = { w: cw, h: ch };
    const insets = fitInsets(cw);
    const s = resolveScale(props.view.zoom, stage, design, insets);
    if (typeof scaleRef.current === 'function' && Math.abs((lastScale.current ?? -1) - s) > 0.0005) {
      lastScale.current = s;
      scaleRef.current(s);
    }
    const origin = originOf(s, props.view.pan, stage, design, insets);
    const ox = origin.x;
    const oy = origin.y;

    ctx.save();
    ctx.shadowColor = 'rgba(4,7,16,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = spec.canvas.light ? '#ffffff' : '#0e0c16';
    ctx.fillRect(ox, oy, designW * s, designH * s);
    ctx.restore();

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    try {
      sf().paint(ctx, sf().layout(spec, { slots: props.slots, fields: props.fields }));
    } catch {
      /* a broken overlay must not blank the editor */
    }

    if (props.grid) {
      ctx.save();
      ctx.strokeStyle = spec.canvas.light ? 'rgba(96,64,150,0.16)' : 'rgba(196,170,255,0.18)';
      ctx.lineWidth = 1 / s;
      for (let i = 1; i < 10; i += 1) {
        ctx.beginPath(); ctx.moveTo((designW * i) / 10, 0); ctx.lineTo((designW * i) / 10, designH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (designH * i) / 10); ctx.lineTo(designW, (designH * i) / 10); ctx.stroke();
      }
      ctx.restore();
    }

    /* slot outlines + numbers, quietly, so a photo never hides where a cut goes */
    spec.cells.forEach((cell, index) => {
      const active = selection?.kind === 'cell' && selection.index === index;
      ctx.save();
      ctx.lineWidth = (active ? 1.6 : 1) / s;
      ctx.strokeStyle = active ? '#a78bfa' : (spec.canvas.light ? 'rgba(60,44,90,0.14)' : 'rgba(235,226,255,0.14)');
      if (!active) ctx.setLineDash([5 / s, 6 / s]);
      ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
      ctx.rotate(((cell.rotation ?? 0) * Math.PI) / 180);
      sf().helpers.roundRect(ctx, -cell.w / 2, -cell.h / 2, cell.w, cell.h, cell.radius);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      const label = (index + 1).toString().padStart(2, '0');
      const fs = 12 / s;
      ctx.font = `700 ${fs}px ${sf().FONTS.sans}`;
      const padX = 6 / s;
      const bw = ctx.measureText(label).width + padX * 2;
      const bh = fs * 1.55;
      ctx.fillStyle = active ? 'rgba(167,139,250,0.95)' : 'rgba(8,12,24,0.55)';
      sf().helpers.roundRect(ctx, cell.x + 7 / s, cell.y + 7 / s, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cell.x + 7 / s + padX, cell.y + 7 / s + bh / 2 + 0.5 / s);
      ctx.restore();
    });

    /* the selection: one turned box, four corner grips, one rotation grip */
    if (selection && selection.kind !== 'overlay') {
      const b = boundsOf(spec, selection);
      if (b) {
        const pts = handlePoints(b, s);
        ctx.save();
        ctx.lineWidth = 1.8 / s;
        ctx.strokeStyle = '#a78bfa';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts.nw.x, pts.nw.y);
        ctx.lineTo(pts.ne.x, pts.ne.y);
        ctx.lineTo(pts.se.x, pts.se.y);
        ctx.lineTo(pts.sw.x, pts.sw.y);
        ctx.closePath();
        ctx.stroke();

        const top = { x: (pts.nw.x + pts.ne.x) / 2, y: (pts.nw.y + pts.ne.y) / 2 };
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(pts.rotate.x, pts.rotate.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pts.rotate.x, pts.rotate.y, 9 / s, 0, Math.PI * 2);
        ctx.fillStyle = '#a78bfa';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pts.rotate.x, pts.rotate.y, 3.4 / s, 0.4, Math.PI * 1.75);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 / s;
        ctx.stroke();

        const hs = 11 / s;
        (['nw', 'ne', 'sw', 'se'] as Corner[]).forEach((corner) => {
          const p = pts[corner];
          ctx.beginPath();
          sf().helpers.roundRect(ctx, p.x - hs / 2, p.y - hs / 2, hs, hs, 2.5 / s);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 1.6 / s;
          ctx.stroke();
        });
        ctx.restore();
      }
    }

    if (guides.v.length || guides.h.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(236,72,153,0.9)';
      ctx.lineWidth = 1 / s;
      guides.v.forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, designH); ctx.stroke(); });
      guides.h.forEach((y) => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(designW, y); ctx.stroke(); });
      ctx.restore();
    }
    ctx.restore();
  }, [spec, props.slots, props.fields, props.view, props.grid, selection, scale, size, design, designW, designH, guides, boundsOf]);

  useEffect(() => { draw(); }, [draw]);

  /* a background photo, a sprite or a PNG that lands late repaints the plate */
  useEffect(() => sf().onAssetsLoaded(() => draw()), [draw]);

  const toDesign = useCallback((clientX: number, clientY: number): Point => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const stage: Size = { w: rect.width, h: rect.height };
    const insets = fitInsets(stage.w);
    const s = resolveScale(viewRef.current.zoom, stage, design, insets);
    return toDesignPoint(
      { x: clientX - rect.left, y: clientY - rect.top },
      s,
      viewRef.current.pan,
      stage,
      design,
      insets,
    );
  }, [design]);

  const hitTest = useCallback((s: ShutterFrameSpec, pt: Point): Selection => {
    const rows = sf().paintOrder(s).slice().reverse();
    for (const row of rows) {
      if (row.kind === 'overlay') continue;
      const ref: LayerRef = row.kind === 'cell'
        ? { kind: 'cell', index: row.index ?? 0 }
        : row.kind === 'emblem'
          ? { kind: 'emblem' }
          : { kind: row.kind as 'text' | 'sticker', id: row.id ?? '' };
      if (sf().hitLayer(s, { ...ref, vars } as LayerRef & { vars: Record<string, string> }, pt, measure)) {
        if (ref.kind === 'cell') return { kind: 'cell', index: ref.index };
        if (ref.kind === 'text') return { kind: 'text', id: ref.id };
        if (ref.kind === 'sticker') return { kind: 'sticker', id: ref.id };
        return { kind: 'emblem' };
      }
    }
    return null;
  }, [measure, vars]);

  const pinchOf = (box: LayerBounds) => {
    const pts = Array.from(held.current.values()).map((item) => item.design);
    if (pts.length < 2) return undefined;
    const [a, b] = pts;
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      rotation: box.rotation,
    };
  };

  /* ── wheel and trackpad: zoom where the cursor is ───────────────────────── */
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      event.preventDefault();
      const stage: Size = { w: rect.width, h: rect.height };
      const insets = fitInsets(stage.w);
      /* a pinch arrives as a ctrl+wheel with small deltas; a mouse wheel as a
         handful of 100s — both should feel like one step of the same size */
      const unit = event.ctrlKey ? 0.01 : 0.0016;
      const factor = Math.exp(-event.deltaY * unit);
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      onViewRef.current(zoomAround(
        viewRef.current.zoom,
        viewRef.current.pan,
        local,
        factor,
        stage,
        designRef.current,
        insets,
      ));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ── Space is the second hand: hold it and the plate is a camera ────────── */
  useEffect(() => {
    const inField = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node || !node.tagName) return false;
      return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable === true;
    };
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !inField(event.target)) spaceHeld.current = true;
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    const blur = () => { spaceHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const begin = (mode: DragMode, target: Exclude<Selection, null>, box: LayerBounds, pt: Point, corner?: Corner, startedAt = Date.now()) => {
    drag.current = {
      /* `base` is an independent deep copy: every frame of the gesture is
         measured from here, never from the value the last frame left behind. */
      mode, target, base: sf().clone(spec), next: sf().clone(spec), box, start: pt, corner, moved: false,
      startAngle: Math.atan2(pt.y - box.cy, pt.x - box.cx) * 180 / Math.PI,
      startedAt,
      fromSelected: true,
    };
  };

  const startPan = (
    event: React.PointerEvent<HTMLCanvasElement>,
    tapToDeselect: boolean,
    tapSelect?: Exclude<Selection, null>,
  ) => {
    drag.current = null;
    pending.current = null;
    setGuides({ v: [], h: [] });
    viewGesture.current = {
      kind: 'pan',
      id: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      base: { ...viewRef.current.pan },
      moved: false,
      tapToDeselect,
      tapSelect,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const stage: Size = { w: rect.width, h: rect.height };
    const insets = fitInsets(stage.w);
    const scaleNow = resolveScale(viewRef.current.zoom, stage, design, insets);
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const pt = toDesignPoint(local, scaleNow, viewRef.current.pan, stage, design, insets);
    held.current.set(event.pointerId, { client: { x: event.clientX, y: event.clientY }, local, design: pt });
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* a pointer the browser no longer tracks still moves with the finger */
    }

    if (held.current.size === 2) {
      /* The first finger's intent, if it had time to have one: a layer it had
         held for longer than QUICK_PINCH_MS, and only when that layer was
         already the selection. Everything else — a fast second finger, a bare
         spot, an unselected layer — is the viewport's pinch. */
      const dragging = drag.current;
      const waiting = pending.current;
      const anchor = dragging
        ? { target: dragging.target, startedAt: dragging.startedAt, fromSelected: dragging.fromSelected, box: dragging.box }
        : waiting
          ? { target: waiting.target, startedAt: waiting.startedAt, fromSelected: true, box: waiting.box }
          : null;
      const settled = anchor ? Date.now() - anchor.startedAt >= QUICK_PINCH_MS : false;
      if (anchor && settled && anchor.target.kind !== 'overlay' && anchor.box) {
        /* the layer's own pinch: grow it and turn it, as before */
        pending.current = null;
        viewGesture.current = null;
        drag.current = {
          mode: 'pinch', target: anchor.target, base: sf().clone(spec), next: sf().clone(spec), box: anchor.box, start: pt,
          pinch: pinchOf(anchor.box), moved: false, startedAt: anchor.startedAt, fromSelected: true,
        };
        event.preventDefault();
        return;
      }
      /* a quick second finger cancels whatever the first one had started: a
         dragged layer goes back to where it was, and the view zooms instead */
      if (dragging && dragging.moved) {
        props.onSpecChange(sf().touch(dragging.base, {}));
      }
      pending.current = null;
      drag.current = null;
      setGuides({ v: [], h: [] });
      setAngleBadge(null);
      const [a, b] = Array.from(held.current.values()).map((item) => item.local);
      if (a && b) {
        const baseDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const baseMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        viewGesture.current = {
          kind: 'pinch',
          baseDist,
          scale: scaleNow,
          /* the design point under the fingers stays under the fingers */
          anchor: toDesignPoint(baseMid, scaleNow, viewRef.current.pan, stage, design, insets),
        };
        event.preventDefault();
        return;
      }
    }
    if (held.current.size > 1) return;

    /* a middle button or the Space bar turns any spot into the camera */
    if (event.button === 1 || spaceHeld.current) {
      startPan(event, false);
      event.preventDefault();
      return;
    }

    const now = Date.now();
    const current = selection;
    if (current && current.kind !== 'overlay') {
      const box = boundsOf(spec, current);
      if (box) {
        const handle: Handle | null = hitHandle(pt, box, scaleNow);
        if (handle === 'rotate') {
          pending.current = { id: event.pointerId, target: current, mode: 'rotate', box, start: pt, startClient: { x: event.clientX, y: event.clientY }, startedAt: now };
          return;
        }
        if (handle) {
          pending.current = { id: event.pointerId, target: current, mode: 'resize', box, start: pt, startClient: { x: event.clientX, y: event.clientY }, startedAt: now, corner: handle };
          return;
        }
        const ref = layerRef(current);
        if (ref && sf().hitLayer(spec, { ...ref, vars } as LayerRef & { vars: Record<string, string> }, pt, measure)) {
          pending.current = { id: event.pointerId, target: current, mode: 'move', box, start: pt, startClient: { x: event.clientX, y: event.clientY }, startedAt: now };
          return;
        }
      }
    }

    const hit = hitTest(spec, pt);
    if (hit) {
      /* An unselected layer: a short tap picks it, a drag moves the plate. Its
         selection is decided on release, so a pinch that follows a fast second
         finger never flicks a drawer open under the zooming hand. */
      startPan(event, false, hit);
      return;
    }

    /* an empty spot: a drag moves the viewport, a tap lets the selection go */
    startPan(event, true);
  };

  const setRotation = (target: Exclude<Selection, null>, next: ShutterFrameSpec, deg: number) => {
    if (target.kind === 'cell') {
      const cell = next.cells[target.index];
      if (cell) cell.rotation = Math.round(deg * 10) / 10;
    } else if (target.kind === 'text') {
      const t2 = next.texts.find((item) => item.id === target.id);
      if (t2) t2.rotation = Math.round(deg * 10) / 10;
    } else if (target.kind === 'sticker') {
      const st = (next.stickers ?? []).find((item) => item.id === target.id);
      if (st) st.rotation = Math.round(deg * 10) / 10;
    } else if (target.kind === 'emblem') {
      next.emblem.rotation = Math.round(deg * 10) / 10;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const known = held.current.get(event.pointerId);
    if (!known) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    known.client = { x: event.clientX, y: event.clientY };
    known.local = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    const gesture = viewGesture.current;
    if (gesture) {
      const stage: Size = { w: rect.width, h: rect.height };
      const insets = fitInsets(stage.w);
      if (gesture.kind === 'pan') {
        const dx = event.clientX - gesture.start.x;
        const dy = event.clientY - gesture.start.y;
        if (!gesture.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
        gesture.moved = true;
        event.preventDefault();
        const s = resolveScale(viewRef.current.zoom, stage, design, insets);
        onViewRef.current({
          zoom: viewRef.current.zoom,
          pan: clampPan({ x: gesture.base.x + dx, y: gesture.base.y + dy }, s, stage, design, insets),
        });
        return;
      }
      const [a, b] = Array.from(held.current.values()).map((item) => item.local);
      if (!a || !b) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      event.preventDefault();
      onViewRef.current(pinchAround(
        gesture.anchor,
        gesture.scale,
        dist / gesture.baseDist,
        mid,
        stage,
        design,
        insets,
      ));
      return;
    }

    /* a candidate drag turns real only once the finger has travelled past the
       tap's dead zone; until then the plate has not been edited at all */
    const waiting = pending.current;
    if (waiting && waiting.id === event.pointerId) {
      const travel = Math.hypot(event.clientX - waiting.startClient.x, event.clientY - waiting.startClient.y);
      if (travel <= PAN_THRESHOLD) return;
      pending.current = null;
      begin(waiting.mode, waiting.target, waiting.box, waiting.start, waiting.corner, waiting.startedAt);
    }

    const state = drag.current;
    if (!state) return;
    const scaleNow = resolveScale(viewRef.current.zoom, { w: rect.width, h: rect.height }, design, fitInsets(rect.width));
    const pt = toDesignPoint(known.local, scaleNow, viewRef.current.pan, { w: rect.width, h: rect.height }, design, fitInsets(rect.width));
    known.design = pt;
    event.preventDefault();

    if (state.mode === 'pinch') {
      const pts = Array.from(held.current.values()).map((item) => item.design);
      if (pts.length < 2 || !state.pinch) return;
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = clamp(state.pinch.dist > 4 ? dist / state.pinch.dist : 1, 0.2, 6);
      const w = clamp(state.box.box.w * ratio, 16, designW * 3);
      const h = clamp(state.box.box.h * ratio, 16, designH * 3);
      const center = {
        x: state.box.cx + (mid.x - state.pinch.mid.x),
        y: state.box.cy + (mid.y - state.pinch.mid.y),
      };
      const rect2 = { x: center.x - w / 2, y: center.y - h / 2, w, h };
      const next = state.next;
      pinchLayer(state.target, state.base, next, ratio, rect2);
      const delta = (angle - state.pinch.angle) * 180 / Math.PI;
      setRotation(state.target, next, state.pinch.rotation + delta);
      state.moved = true;
      props.onSpecChange({ ...next });
      return;
    }

    const target = state.target;
    const dx = pt.x - state.start.x;
    const dy = pt.y - state.start.y;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) state.moved = true;

    if (state.mode === 'move') {
      const moved = { ...state.box, x: state.box.x + dx, y: state.box.y + dy };
      const snap = snapMove(moved, othersOf(state.base, target), { w: designW, h: designH }, scaleNow);
      setGuides(snap.guides);
      moveLayer(target, state.base, state.next, dx + snap.dx, dy + snap.dy);
      props.onSpecChange({ ...state.next });
      return;
    }

    if (state.mode === 'resize' && state.corner) {
      const rect2 = resizeBox(state.box.box, state.box.rotation, state.corner, pt);
      resizeLayer(target, state.base, state.next, rect2, state.box.box, (item) => measure(item, sf().applyVars(item.text, vars)));
      props.onSpecChange({ ...state.next });
      return;
    }

    if (state.mode === 'rotate') {
      const raw = Math.atan2(pt.y - state.box.cy, pt.x - state.box.cx) * 180 / Math.PI;
      const delta = raw - (state.startAngle ?? raw);
      const snapped = snapAngle(state.box.rotation + delta, 45, 4);
      setRotation(target, state.next, snapped.value);
      setAngleBadge(`${Math.round(snapped.value)}°`);
      props.onSpecChange({ ...state.next });
    }
  };

  const endDrag = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    const id = event?.pointerId;
    if (id !== undefined) {
      held.current.delete(id);
      try { event?.currentTarget.releasePointerCapture(id); } catch { /* already gone */ }
    } else {
      held.current.clear();
    }

    const wait = pending.current;
    if (wait && (id === undefined || wait.id === id)) pending.current = null;

    const gesture = viewGesture.current;
    if (gesture && gesture.kind === 'pan') {
      viewGesture.current = null;
      /* one short tap: pick the layer under it, or let the selection go */
      if (!gesture.moved && event?.type === 'pointerup') {
        if (gesture.tapSelect) props.onSelect(gesture.tapSelect);
        else if (gesture.tapToDeselect) props.onSelect(null);
      }
    } else if (gesture && gesture.kind === 'pinch') {
      viewGesture.current = null;
      /* a finger left on the glass keeps moving the viewport */
      const rest = Array.from(held.current.entries())[0];
      if (rest && held.current.size === 1) {
        const [restId, point] = rest;
        viewGesture.current = {
          kind: 'pan', id: restId, start: { ...point.client }, base: { ...viewRef.current.pan }, moved: true, tapToDeselect: false,
        };
      }
    }

    const state = drag.current;
    if (state && state.moved) props.onSpecChange(sf().touch(state.next, {}));
    if (held.current.size === 0) {
      drag.current = null;
      pending.current = null;
      viewGesture.current = null;
      setGuides({ v: [], h: [] });
      setAngleBadge(null);
    } else if (state && state.mode === 'pinch') {
      drag.current = null;
      setAngleBadge(null);
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = toDesign(event.clientX, event.clientY);
    for (let index = 0; index < spec.cells.length; index += 1) {
      if (sf().hitLayer(spec, { kind: 'cell', index }, pt, measure)) {
        pendingSlot.current = index;
        fileInput.current?.click();
        return;
      }
    }
  };

  return (
    <div className="stage">
      <div className="stage-wrap" ref={wrap}>
        <canvas
          ref={canvas}
          className="stage-canvas"
          aria-label={t('stage.canvasLabel')}
          style={{ width: '100%', height: '100%' }}
          data-scale={scale.toFixed(4)}
          data-zoom={props.view.zoom === 'fit' ? 'fit' : props.view.zoom.toFixed(3)}
          data-pan-x={props.view.pan.x.toFixed(2)}
          data-pan-y={props.view.pan.y.toFixed(2)}
          data-origin-x={shownOrigin.x.toFixed(2)}
          data-origin-y={shownOrigin.y.toFixed(2)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
        />
        {angleBadge && <div className="stage-angle" role="status">{angleBadge}</div>}
      </div>
      {props.overlay}
      <div className="stage-hint">{t('stage.hint')}</div>
      <div className="stage-spec">{t('stage.spec', { w: spec.canvas.width, h: spec.canvas.height, n: spec.cells.length })}</div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onSlotFile(pendingSlot.current, file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
