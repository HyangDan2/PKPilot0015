import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sf, type FrameFields, type FrameSlot, type ShutterFrameSpec } from '../spec/shutterframe';
import { Icon } from './Icons';
import type { Selection } from '../editor/selection';

export interface StageCanvasProps {
  spec: ShutterFrameSpec;
  slots: FrameSlot[];
  fields: FrameFields;
  selection: Selection;
  grid: boolean;
  zoom: number | 'fit';
  onZoom: (zoom: number | 'fit') => void;
  onGrid: (value: boolean) => void;
  onSelect: (selection: Selection) => void;
  onSpecChange: (next: ShutterFrameSpec) => void;
  onSlotFile: (index: number, file: File) => void;
}

type DragMode = 'move' | 'resize';
type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: DragMode;
  target: Selection;
  corner?: Corner;
  startX: number;
  startY: number;
  base: ShutterFrameSpec;
}

const HANDLE = 9;
const SNAP = 6;

export function StageCanvas(props: StageCanvasProps) {
  const { spec } = props;
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<number>(0);
  const drag = useRef<DragState | null>(null);
  const boxes = useRef<{ texts: Record<string, Box>; emblem: Box | null }>({ texts: {}, emblem: null });
  const [size, setSize] = useState({ w: 720, h: 640 });
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  useLayoutEffect(() => {
    const host = wrap.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ w: Math.max(120, Math.round(rect.width)), h: Math.max(160, Math.round(rect.height)) });
    });
    observer.observe(host);
    const rect = host.getBoundingClientRect();
    setSize({ w: Math.max(120, Math.round(rect.width)), h: Math.max(160, Math.round(rect.height)) });
    return () => observer.disconnect();
  }, []);

  const designW = spec.canvas.width;
  const designH = spec.canvas.height;
  const fit = Math.min((size.w - 48) / designW, (size.h - 48) / designH);
  const scale = props.zoom === 'fit' ? Math.max(0.05, fit) : props.zoom;

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = size.w;
    const ch = size.h;
    if (el.width !== Math.round(cw * dpr) || el.height !== Math.round(ch * dpr)) {
      el.width = Math.round(cw * dpr);
      el.height = Math.round(ch * dpr);
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const s = scale;
    const ox = (cw - designW * s) / 2;
    const oy = (ch - designH * s) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(24,16,48,0.22)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
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

    // cell outlines + slot numbers
    spec.cells.forEach((cell, index) => {
      const active = props.selection?.kind === 'cell' && props.selection.index === index;
      ctx.save();
      ctx.lineWidth = (active ? 2 : 1) / s;
      ctx.strokeStyle = active ? '#8b5cf6' : (spec.canvas.light ? 'rgba(60,44,90,0.16)' : 'rgba(235,226,255,0.16)');
      if (!active) ctx.setLineDash([5 / s, 6 / s]);
      sf().helpers.roundRect(ctx, cell.x, cell.y, cell.w, cell.h, cell.radius);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      const label = (index + 1).toString().padStart(2, '0');
      const fs = 13 / s;
      ctx.font = `700 ${fs}px ${sf().FONTS.sans}`;
      const padX = 7 / s;
      const bw = ctx.measureText(label).width + padX * 2;
      const bh = fs * 1.55;
      ctx.fillStyle = active ? 'rgba(139,92,246,0.95)' : 'rgba(20,16,32,0.55)';
      sf().helpers.roundRect(ctx, cell.x + 8 / s, cell.y + 8 / s, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cell.x + 8 / s + padX, cell.y + 8 / s + bh / 2 + 0.5 / s);
      ctx.restore();
    });

    // text + emblem boxes (measured here so hit testing matches what is drawn)
    const vars = sf().buildVars(spec, props.fields);
    const textBoxes: Record<string, Box> = {};
    spec.texts.forEach((item) => {
      if (item.visible === false) return;
      const content = sf().applyVars(item.text, vars);
      if (!content) return;
      ctx.save();
      ctx.font = `${item.weight} ${item.size}px ${sf().FONTS[item.family]}`;
      const width = ctx.measureText(content).width + Math.abs(item.letterSpacing) * content.length;
      const left = item.align === 'left' ? item.x : item.align === 'right' ? item.x - width : item.x - width / 2;
      const top = item.y - item.size * 0.82;
      const box = { x: left, y: top, w: width, h: item.size * 1.1 };
      textBoxes[item.id] = box;
      const active = props.selection?.kind === 'text' && props.selection.id === item.id;
      /* Only the selected row wears a box: the plate itself stays clean. */
      if (active) {
        ctx.lineWidth = 1.6 / s;
        ctx.strokeStyle = '#8b5cf6';
        ctx.setLineDash([]);
        ctx.strokeRect(box.x - 3 / s, box.y, box.w + 6 / s, box.h);
      }
      ctx.restore();
    });
    boxes.current.texts = textBoxes;

    let emblemBox: Box | null = null;
    if (spec.emblem.enabled) {
      const e = spec.emblem;
      const mw = Math.min(e.maxW, e.maxH * 3.4);
      const left = e.align === 'left' ? e.x : e.align === 'right' ? e.x - mw : e.x - mw / 2;
      emblemBox = { x: left, y: e.y - e.maxH / 2, w: mw, h: e.maxH };
      boxes.current.emblem = emblemBox;
      const active = props.selection?.kind === 'emblem';
      if (active) {
        ctx.save();
        ctx.lineWidth = 1.6 / s;
        ctx.strokeStyle = '#8b5cf6';
        ctx.strokeRect(emblemBox.x, emblemBox.y, emblemBox.w, emblemBox.h);
        ctx.restore();
      }
    } else {
      boxes.current.emblem = null;
    }

    // snap guides
    if (guides.v.length || guides.h.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(236,72,153,0.9)';
      ctx.lineWidth = 1 / s;
      guides.v.forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, designH); ctx.stroke(); });
      guides.h.forEach((y) => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(designW, y); ctx.stroke(); });
      ctx.restore();
    }

    // corner handles
    const cell = props.selection?.kind === 'cell' ? spec.cells[props.selection.index] : null;
    if (cell) {
      const hs = HANDLE / s;
      const corners: [Corner, number, number][] = [
        ['nw', cell.x, cell.y], ['ne', cell.x + cell.w, cell.y],
        ['sw', cell.x, cell.y + cell.h], ['se', cell.x + cell.w, cell.y + cell.h],
      ];
      corners.forEach(([, cx, cy]) => {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 1.6 / s;
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
        ctx.restore();
      });
    }
    ctx.restore();
  }, [spec, props.slots, props.fields, props.selection, props.grid, scale, size, designW, designH, guides]);

  useEffect(() => { draw(); }, [draw]);

  const toDesign = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const ox = (rect.width - designW * scale) / 2;
    const oy = (rect.height - designH * scale) / 2;
    return { x: (event.clientX - rect.left - ox) / scale, y: (event.clientY - rect.top - oy) / scale };
  };

  const hitCorner = (pt: Point, cell: { x: number; y: number; w: number; h: number }): Corner | null => {
    const r = HANDLE / scale + 3 / scale;
    const near = (x: number, y: number) => Math.abs(pt.x - x) <= r && Math.abs(pt.y - y) <= r;
    if (near(cell.x, cell.y)) return 'nw';
    if (near(cell.x + cell.w, cell.y)) return 'ne';
    if (near(cell.x, cell.y + cell.h)) return 'sw';
    if (near(cell.x + cell.w, cell.y + cell.h)) return 'se';
    return null;
  };

  const hitTest = (pt: Point): Selection => {
    if (props.selection?.kind === 'cell') {
      const cell = spec.cells[props.selection.index];
      if (cell && hitCorner(pt, cell)) return props.selection;
    }
    const texts = spec.texts;
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const box = boxes.current.texts[texts[i].id];
      if (box && inside(pt, box)) return { kind: 'text', id: texts[i].id };
    }
    const emblem = boxes.current.emblem;
    if (emblem && spec.emblem.enabled && inside(pt, emblem)) return { kind: 'emblem' };
    for (let i = spec.cells.length - 1; i >= 0; i -= 1) {
      if (inside(pt, spec.cells[i])) return { kind: 'cell', index: i };
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toDesign(event);
    const hit = hitTest(pt);
    props.onSelect(hit);
    if (!hit) { drag.current = null; return; }
    const corner = hit.kind === 'cell' && props.selection?.kind === 'cell' && props.selection.index === hit.index
      ? hitCorner(pt, spec.cells[hit.index])
      : null;
    drag.current = {
      mode: corner ? 'resize' : 'move',
      target: hit,
      corner: corner ?? undefined,
      startX: pt.x,
      startY: pt.y,
      base: sf().clone(spec),
    };
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (!state) return;
    const pt = toDesign(event);
    const dx = pt.x - state.startX;
    const dy = pt.y - state.startY;
    const next = sf().clone(state.base);
    const lines = snapLines(state.base, state.target);

    if (state.target?.kind === 'cell') {
      const index = state.target.index;
      const orig = state.base.cells[index];
      if (state.mode === 'resize' && state.corner) {
        let { x, y, w, h } = orig;
        if (state.corner.indexOf('e') >= 0) w = orig.w + dx;
        if (state.corner.indexOf('s') >= 0) h = orig.h + dy;
        if (state.corner.indexOf('w') >= 0) { x = orig.x + dx; w = orig.w - dx; }
        if (state.corner.indexOf('n') >= 0) { y = orig.y + dy; h = orig.h - dy; }
        w = Math.max(16, w);
        h = Math.max(16, h);
        next.cells[index] = { ...orig, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
        setGuides({ v: [], h: [] });
      } else {
        let x = orig.x + dx;
        let y = orig.y + dy;
        const snapped = snapRect({ x, y, w: orig.w, h: orig.h }, state.base, index, lines);
        x = snapped.x;
        y = snapped.y;
        setGuides(snapped.guides);
        next.cells[index] = { ...orig, x: Math.round(x), y: Math.round(y) };
      }
    } else if (state.target?.kind === 'text') {
      const item = next.texts.find((t) => t.id === (state.target as { id: string }).id);
      const baseItem = state.base.texts.find((t) => t.id === (state.target as { id: string }).id);
      if (item && baseItem) {
        item.x = Math.round(baseItem.x + dx);
        item.y = Math.round(baseItem.y + dy);
      }
    } else if (state.target?.kind === 'emblem') {
      next.emblem.x = Math.round(state.base.emblem.x + dx);
      next.emblem.y = Math.round(state.base.emblem.y + dy);
    }
    props.onSpecChange(next);
  };

  const endDrag = () => {
    drag.current = null;
    setGuides({ v: [], h: [] });
  };

  const onDoubleClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toDesign(event);
    const cellIndex = spec.cells.findIndex((cell) => inside(pt, cell));
    if (cellIndex >= 0) {
      pendingSlot.current = cellIndex;
      fileInput.current?.click();
    }
  };

  return (
    <div className="stage">
      <div className="stage-wrap" ref={wrap}>
        <canvas
          ref={canvas}
          className="stage-canvas"
          style={{ width: '100%', height: '100%' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick as unknown as React.MouseEventHandler<HTMLCanvasElement>}
        />
        <div className="stage-hint">드래그로 이동 · 모서리로 크기 조절 · 슬롯 더블클릭으로 사진 교체</div>
      </div>
      <div className="stage-bar">
        <div className="zoom-group" role="group" aria-label="줌">
          <button type="button" className={`chip${props.zoom === 'fit' ? ' on' : ''}`} onClick={() => props.onZoom('fit')}>맞춤</button>
          <button type="button" className={`chip${props.zoom === 0.5 ? ' on' : ''}`} onClick={() => props.onZoom(0.5)}>50%</button>
          <button type="button" className={`chip${props.zoom === 1 ? ' on' : ''}`} onClick={() => props.onZoom(1)}>100%</button>
        </div>
        <span className="zoom-readout">{Math.round(scale * 100)}%</span>
        <button type="button" className={`chip${props.grid ? ' on' : ''}`} onClick={() => props.onGrid(!props.grid)}>
          <Icon name="grid" size={13} /> 그리드
        </button>
        <span className="stage-spec">{spec.canvas.width}×{spec.canvas.height}px · 4컷</span>
      </div>
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

interface Point { x: number; y: number }
interface Box { x: number; y: number; w: number; h: number }

function inside(pt: Point, box: Box): boolean {
  return pt.x >= box.x && pt.x <= box.x + box.w && pt.y >= box.y && pt.y <= box.y + box.h;
}

function snapLines(spec: ShutterFrameSpec, target: Selection): number[] {
  const xs: number[] = [0, spec.canvas.width / 2, spec.canvas.width];
  const ys: number[] = [0, spec.canvas.height / 2, spec.canvas.height];
  spec.cells.forEach((cell, index) => {
    if (target?.kind === 'cell' && target.index === index) return;
    xs.push(cell.x, cell.x + cell.w, cell.x + cell.w / 2);
    ys.push(cell.y, cell.y + cell.h, cell.y + cell.h / 2);
  });
  return [...xs, ...ys];
}

function snapRect(rect: Box, spec: ShutterFrameSpec, index: number, lines: number[]) {
  const xs = lines.filter((n) => n <= spec.canvas.width);
  const ys = lines.filter((n) => n <= spec.canvas.height);
  const guides: { v: number[]; h: number[] } = { v: [], h: [] };
  let bestX = SNAP + 1;
  let bx = rect.x;
  [rect.x, rect.x + rect.w / 2, rect.x + rect.w].forEach((edge, i) => {
    xs.forEach((line) => {
      const d = Math.abs(edge - line);
      if (d < bestX && d <= SNAP) {
        bestX = d;
        bx = rect.x + (line - edge);
        guides.v = [line];
      }
      void i;
    });
  });
  let bestY = SNAP + 1;
  let by = rect.y;
  [rect.y, rect.y + rect.h / 2, rect.y + rect.h].forEach((edge) => {
    ys.forEach((line) => {
      const d = Math.abs(edge - line);
      if (d < bestY && d <= SNAP) {
        bestY = d;
        by = rect.y + (line - edge);
        guides.h = [line];
      }
    });
  });
  void spec;
  void index;
  return { x: bx, y: by, guides };
}
