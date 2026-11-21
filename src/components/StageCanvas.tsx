import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sf, layerRef, type FrameFields, type FrameSlot, type LayerBounds, type LayerRef, type ShutterFrameSpec } from '../spec/shutterframe';
import { useI18n } from '../i18n';
import type { Selection } from '../editor/selection';
import {
  clamp, handlePoints, hitHandle, resizeBox, snapAngle, snapMove,
  type Box, type Corner, type Handle, type Point,
} from '../editor/geometry';
import { moveLayer, pinchLayer, resizeLayer } from '../editor/drag';

export interface StageCanvasProps {
  spec: ShutterFrameSpec;
  slots: FrameSlot[];
  fields: FrameFields;
  selection: Selection;
  grid: boolean;
  zoom: number | 'fit';
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
}

/**
 * The plate, and a finger's whole vocabulary on it: tap to select, drag to
 * move (with magnet guides), corner grips to grow or shrink, the top grip to
 * turn, two fingers to pinch and twist. Nothing here needs an input box.
 */
export function StageCanvas(props: StageCanvasProps) {
  const { t } = useI18n();
  const { spec, selection } = props;
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef(0);
  const drag = useRef<DragState | null>(null);
  const pointers = useRef<Map<number, Point>>(new Map());
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
  const boxW = Math.max(120, Math.round(liveBox.current.w || size.w));
  const boxH = Math.max(160, Math.round(liveBox.current.h || size.h));
  const fit = Math.min((boxW - 40) / designW, (boxH - 40) / designH);
  const scale = props.zoom === 'fit' ? Math.max(0.05, fit) : props.zoom;
  const vars = useMemo(() => sf().buildVars(spec, props.fields), [spec, props.fields]);

  const scaleRef = useRef(props.onScale);
  useEffect(() => { scaleRef.current = props.onScale; }, [props.onScale]);
  useEffect(() => { scaleRef.current(scale); }, [scale]);

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

    const fitLive = Math.min((cw - 40) / designW, (ch - 40) / designH);
    const s = props.zoom === 'fit' ? Math.max(0.05, fitLive) : props.zoom;
    if (typeof scaleRef.current === 'function' && Math.abs((lastScale.current ?? -1) - s) > 0.0005) {
      lastScale.current = s;
      scaleRef.current(s);
    }
    const ox = (cw - designW * s) / 2;
    const oy = (ch - designH * s) / 2;

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
  }, [spec, props.slots, props.fields, props.grid, selection, scale, size, designW, designH, guides, boundsOf]);

  useEffect(() => { draw(); }, [draw]);

  /* a background photo, a sprite or a PNG that lands late repaints the plate */
  useEffect(() => sf().onAssetsLoaded(() => draw()), [draw]);

  const toDesign = useCallback((clientX: number, clientY: number): Point => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const ox = (rect.width - designW * scale) / 2;
    const oy = (rect.height - designH * scale) / 2;
    return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale };
  }, [designW, designH, scale]);

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
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return undefined;
    const [a, b] = pts;
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      rotation: box.rotation,
    };
  };

  const begin = (mode: DragMode, target: Exclude<Selection, null>, box: LayerBounds, pt: Point, corner?: Corner) => {
    drag.current = {
      /* `base` is an independent deep copy: every frame of the gesture is
         measured from here, never from the value the last frame left behind. */
      mode, target, base: sf().clone(spec), next: sf().clone(spec), box, start: pt, corner, moved: false,
      startAngle: Math.atan2(pt.y - box.cy, pt.x - box.cx) * 180 / Math.PI,
    };
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toDesign(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, pt);
    try {
      (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
    } catch {
      /* a pointer the browser no longer tracks still moves with the finger */
    }

    if (pointers.current.size === 2) {
      const target = selection ?? null;
      if (target && target.kind !== 'overlay') {
        const box = boundsOf(spec, target);
        if (box) {
          drag.current = {
            mode: 'pinch', target, base: sf().clone(spec), next: sf().clone(spec), box, start: pt,
            pinch: pinchOf(box), moved: false,
          };
          event.preventDefault();
          return;
        }
      }
    }
    if (pointers.current.size > 1) return;

    const current = selection;
    if (current && current.kind !== 'overlay') {
      const box = boundsOf(spec, current);
      if (box) {
        const handle: Handle | null = hitHandle(pt, box, scale);
        if (handle === 'rotate') { begin('rotate', current, box, pt); return; }
        if (handle) { begin('resize', current, box, pt, handle); return; }
        const ref = layerRef(current);
        if (ref && sf().hitLayer(spec, { ...ref, vars } as LayerRef & { vars: Record<string, string> }, pt, measure)) {
          begin('move', current, box, pt);
          return;
        }
      }
    }

    const hit = hitTest(spec, pt);
    props.onSelect(hit);
    if (hit) {
      const box = boundsOf(spec, hit);
      if (box) begin('move', hit, box, pt);
    } else {
      drag.current = null;
      setGuides({ v: [], h: [] });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const pt = toDesign(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, pt);
    const state = drag.current;
    if (!state) return;
    event.preventDefault();

    if (state.mode === 'pinch') {
      const pts = Array.from(pointers.current.values());
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
      const rect = { x: center.x - w / 2, y: center.y - h / 2, w, h };
      const next = state.next;
      pinchLayer(state.target, state.base, next, ratio, rect);
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
      const snap = snapMove(moved, othersOf(state.base, target), { w: designW, h: designH }, scale);
      setGuides(snap.guides);
      moveLayer(target, state.base, state.next, dx + snap.dx, dy + snap.dy);
      props.onSpecChange({ ...state.next });
      return;
    }

    if (state.mode === 'resize' && state.corner) {
      const rect = resizeBox(state.box.box, state.box.rotation, state.corner, pt);
      resizeLayer(target, state.base, state.next, rect, state.box.box, (item) => measure(item, sf().applyVars(item.text, vars)));
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
    if (event) pointers.current.delete(event.pointerId);
    else pointers.current.clear();
    const state = drag.current;
    if (state && state.moved) props.onSpecChange(sf().touch(state.next, {}));
    if (pointers.current.size === 0) {
      drag.current = null;
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
