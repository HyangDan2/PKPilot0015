import { useRef } from 'react';
import { sf, type FrameAlign, type FrameFamily, type ShutterFrameSpec } from '../spec/shutterframe';
import { Icon } from './Icons';
import type { Selection } from '../editor/selection';

export interface RightPanelProps {
  spec: ShutterFrameSpec;
  selection: Selection;
  onChange: (next: ShutterFrameSpec) => void;
  onOverlayFile: (file: File) => void;
  onRemoveOverlay: () => void;
  onSlotFile: (index: number, file: File) => void;
}

const CANVAS_PRESETS = [
  { id: 'strip', label: '1×4 · 600×1800', w: 600, h: 1800 },
  { id: 'grid', label: '2×2 · 1200×1600', w: 1200, h: 1600 },
  { id: 'portrait', label: '3:4 · 1200×1600', w: 1200, h: 1600 },
  { id: 'square', label: '1:1 · 1200×1200', w: 1200, h: 1200 },
];

const VARS = ['date', 'camera', 'title', 'caption', 'film', 'lens', 'shutter', 'iso', 'aperture'];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}{hint && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function RightPanel(props: RightPanelProps) {
  const { spec, selection } = props;
  const overlayInput = useRef<HTMLInputElement | null>(null);
  const slotInput = useRef<HTMLInputElement | null>(null);
  const slotIndex = useRef(0);
  const patch = (next: Partial<ShutterFrameSpec>) => props.onChange(sf().touch(spec, next));

  const setCanvasSize = (w: number, h: number) => {
    const nx = Math.max(240, Math.round(w));
    const ny = Math.max(240, Math.round(h));
    const kx = nx / spec.canvas.width;
    const ky = ny / spec.canvas.height;
    const next = sf().clone(spec);
    next.canvas.width = nx;
    next.canvas.height = ny;
    next.cells = next.cells.map((cell) => ({
      ...cell,
      x: Math.round(cell.x * kx), y: Math.round(cell.y * ky),
      w: Math.round(cell.w * kx), h: Math.round(cell.h * ky),
    }));
    next.texts = next.texts.map((item) => ({ ...item, x: Math.round(item.x * kx), y: Math.round(item.y * ky), size: Math.round(item.size * Math.min(kx, ky)) }));
    next.emblem = { ...next.emblem, x: Math.round(next.emblem.x * kx), y: Math.round(next.emblem.y * ky) };
    props.onChange(sf().touch(next, {}));
  };

  return (
    <aside className="rail right-panel">
      <section className="rail-section">
        <h2 className="rail-title">프레임</h2>
        <Field label="이름">
          <input value={spec.name} onChange={(event) => patch({ name: event.target.value })} maxLength={60} />
        </Field>
        <Field label="캔버스 크기" hint="비율 바꾸면 칸도 함께 조정">
          <div className="preset-grid">
            {CANVAS_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${spec.canvas.width === item.w && spec.canvas.height === item.h ? ' on' : ''}`}
                onClick={() => setCanvasSize(item.w, item.h)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="pair">
            <NumField label="W" value={spec.canvas.width} min={240} max={4000} onChange={(v) => setCanvasSize(v, spec.canvas.height)} />
            <NumField label="H" value={spec.canvas.height} min={240} max={4000} onChange={(v) => setCanvasSize(spec.canvas.width, v)} />
          </div>
        </Field>
        <div className="pair">
          <Field label="배경색">
            <input type="color" value={toHex(spec.canvas.background)} onChange={(event) => {
              const next = sf().clone(spec);
              next.canvas.background = event.target.value;
              props.onChange(sf().touch(next, {}));
            }} />
          </Field>
          <Field label="밝은 바탕">
            <button type="button" className={`switch${spec.canvas.light ? ' on' : ''}`} onClick={() => {
              const next = sf().clone(spec);
              next.canvas.light = !next.canvas.light;
              props.onChange(sf().touch(next, {}));
            }}><span /></button>
          </Field>
        </div>
        <Field label="그라디언트" hint="2색">
          <div className="grad-row">
            <input type="checkbox" checked={!!spec.canvas.gradient} onChange={(event) => {
              const next = sf().clone(spec);
              next.canvas.gradient = event.target.checked
                ? { type: 'linear', angle: 165, stops: ['#f4f1ea', '#ded4ef'] }
                : undefined;
              props.onChange(sf().touch(next, {}));
            }} />
            {spec.canvas.gradient ? (
              <>
                <input type="color" value={toHex(spec.canvas.gradient.stops[0])} onChange={(event) => {
                  const next = sf().clone(spec);
                  if (next.canvas.gradient) next.canvas.gradient.stops[0] = event.target.value;
                  props.onChange(sf().touch(next, {}));
                }} />
                <input type="color" value={toHex(spec.canvas.gradient.stops[1])} onChange={(event) => {
                  const next = sf().clone(spec);
                  if (next.canvas.gradient) next.canvas.gradient.stops[1] = event.target.value;
                  props.onChange(sf().touch(next, {}));
                }} />
                <NumField label="각도" value={spec.canvas.gradient.angle} min={0} max={360} onChange={(value) => {
                  const next = sf().clone(spec);
                  if (next.canvas.gradient) next.canvas.gradient.angle = value;
                  props.onChange(sf().touch(next, {}));
                }} />
              </>
            ) : <span className="muted">꺼짐</span>}
          </div>
        </Field>
      </section>

      {selection?.kind === 'cell' && (() => {
        const index = selection.index;
        const cell = spec.cells[index];
        const update = (patchCell: Partial<typeof cell>) => {
          const next = sf().clone(spec);
          next.cells[index] = { ...next.cells[index], ...patchCell };
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h2 className="rail-title">슬롯 {String(index + 1).padStart(2, '0')} <small>셀 속성</small></h2>
            <div className="pair">
              <NumField label="X" value={cell.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={cell.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label="W" value={cell.w} min={16} onChange={(v) => update({ w: v })} />
              <NumField label="H" value={cell.h} min={16} onChange={(v) => update({ h: v })} />
            </div>
            <NumField label="모서리 둥글기" value={cell.radius} min={0} max={200} onChange={(v) => update({ radius: v })} />
            <div className="preset-grid">
              <button type="button" className="chip" onClick={() => {
                const margin = Math.round(spec.canvas.width * 0.06);
                const gutter = Math.round(spec.canvas.width * 0.03);
                props.onChange(sf().alignCells(spec, '1x4', margin, gutter));
              }}>1×4 정렬</button>
              <button type="button" className="chip" onClick={() => {
                const margin = Math.round(spec.canvas.width * 0.05);
                const gutter = Math.round(spec.canvas.width * 0.022);
                props.onChange(sf().alignCells(spec, '2x2', margin, gutter));
              }}>2×2 정렬</button>
            </div>
            <button type="button" className="btn ghost small" onClick={() => { slotIndex.current = index; slotInput.current?.click(); }}>
              <Icon name="image" size={13} /> 이 칸에 내 사진 넣기
            </button>
          </section>
        );
      })()}

      {selection?.kind === 'text' && (() => {
        const item = spec.texts.find((t) => t.id === selection.id);
        if (!item) return null;
        const update = (p: Partial<typeof item>) => {
          const next = sf().clone(spec);
          next.texts = next.texts.map((t) => (t.id === item.id ? { ...t, ...p } : t));
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h2 className="rail-title">텍스트 <small>변수 삽입 가능</small></h2>
            <Field label="내용">
              <textarea rows={2} value={item.text} onChange={(event) => update({ text: event.target.value })} />
            </Field>
            <div className="var-chips">
              {VARS.map((name) => (
                <button key={name} type="button" className="chip tiny-chip" onClick={() => update({ text: `${item.text}{{${name}}}` })}>
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
            <div className="pair">
              <NumField label="X" value={item.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={item.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label="크기" value={item.size} min={4} max={400} onChange={(v) => update({ size: v })} />
              <NumField label="자간" value={item.letterSpacing} min={-10} max={40} step={0.5} onChange={(v) => update({ letterSpacing: v })} />
            </div>
            <div className="pair">
              <Field label="서체">
                <select value={item.family} onChange={(event) => update({ family: event.target.value as FrameFamily })}>
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </Field>
              <Field label="굵기">
                <select value={item.weight} onChange={(event) => update({ weight: Number(event.target.value) })}>
                  {[300, 400, 500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </Field>
            </div>
            <div className="pair">
              <Field label="정렬">
                <select value={item.align} onChange={(event) => update({ align: event.target.value as FrameAlign })}>
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </Field>
              <Field label="색">
                <input type="color" value={toHex(item.color)} onChange={(event) => update({ color: event.target.value })} />
              </Field>
            </div>
            <div className="row-btns">
              <button type="button" className="btn ghost small" onClick={() => update({ visible: item.visible === false })}>
                <Icon name={item.visible === false ? 'eye' : 'eyeOff'} size={13} /> {item.visible === false ? '다시 표시' : '숨기기'}
              </button>
              <button type="button" className="btn ghost small danger" onClick={() => {
                const next = sf().clone(spec);
                next.texts = next.texts.filter((t) => t.id !== item.id);
                props.onChange(sf().touch(next, {}));
              }}>
                <Icon name="trash" size={13} /> 삭제
              </button>
            </div>
          </section>
        );
      })()}

      {selection?.kind === 'emblem' && (() => {
        const e = spec.emblem;
        const update = (p: Partial<typeof e>) => {
          const next = sf().clone(spec);
          next.emblem = { ...next.emblem, ...p };
          props.onChange(sf().touch(next, {}));
        };
        return (
          <section className="rail-section">
            <h2 className="rail-title">엠블럼 <small>HD2Lab</small></h2>
            <div className="pair">
              <NumField label="X" value={e.x} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={e.y} onChange={(v) => update({ y: v })} />
            </div>
            <div className="pair">
              <NumField label="최대 W" value={e.maxW} min={8} onChange={(v) => update({ maxW: v })} />
              <NumField label="최대 H" value={e.maxH} min={8} onChange={(v) => update({ maxH: v })} />
            </div>
            <div className="pair">
              <Field label="정렬">
                <select value={e.align} onChange={(event) => update({ align: event.target.value as FrameAlign })}>
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </Field>
              <Field label="잉크">
                <select value={e.mode} onChange={(event) => update({ mode: event.target.value as 'auto' | 'light' | 'dark' })}>
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
            </div>
            <button type="button" className="btn ghost small" onClick={() => update({ enabled: !e.enabled })}>
              <Icon name={e.enabled ? 'eyeOff' : 'eye'} size={13} /> {e.enabled ? '엠블럼 끄기' : '엠블럼 켜기'}
            </button>
          </section>
        );
      })()}

      <section className="rail-section">
        <h2 className="rail-title">퍼포레이션 <small>필름 구멍</small></h2>
        <div className="row-btns">
          <button type="button" className={`switch${spec.perforation.enabled ? ' on' : ''}`} onClick={() => {
            const next = sf().clone(spec);
            next.perforation.enabled = !next.perforation.enabled;
            props.onChange(sf().touch(next, {}));
          }}><span /></button>
          <select value={spec.perforation.style} onChange={(event) => {
            const next = sf().clone(spec);
            next.perforation.style = event.target.value === 'film' ? 'film' : 'side';
            props.onChange(sf().touch(next, {}));
          }}>
            <option value="side">양옆 (side)</option>
            <option value="film">위아래 (film)</option>
          </select>
          <input type="color" value={toHex(spec.perforation.color)} onChange={(event) => {
            const next = sf().clone(spec);
            next.perforation.color = event.target.value;
            props.onChange(sf().touch(next, {}));
          }} />
        </div>
        <div className="pair">
          <NumField label="가로" value={spec.perforation.holeWidth} min={2} onChange={(v) => {
            const next = sf().clone(spec); next.perforation.holeWidth = Math.round(v); props.onChange(sf().touch(next, {}));
          }} />
          <NumField label="세로" value={spec.perforation.holeHeight} min={2} onChange={(v) => {
            const next = sf().clone(spec); next.perforation.holeHeight = Math.round(v); props.onChange(sf().touch(next, {}));
          }} />
        </div>
        <NumField label="간격" value={spec.perforation.gap} min={1} onChange={(v) => {
          const next = sf().clone(spec); next.perforation.gap = Math.round(v); props.onChange(sf().touch(next, {}));
        }} />
      </section>

      <section className="rail-section">
        <h2 className="rail-title">PNG 오버레이 <small>투명 PNG</small></h2>
        {spec.overlay ? (
          <>
            <div className="row-btns">
              <button type="button" className={`chip${spec.overlay.layer === 'above' ? ' on' : ''}`} onClick={() => {
                const next = sf().clone(spec);
                if (next.overlay) next.overlay.layer = 'above';
                props.onChange(sf().touch(next, {}));
              }}>사진 위</button>
              <button type="button" className={`chip${spec.overlay.layer === 'below' ? ' on' : ''}`} onClick={() => {
                const next = sf().clone(spec);
                if (next.overlay) next.overlay.layer = 'below';
                props.onChange(sf().touch(next, {}));
              }}>사진 아래</button>
            </div>
            <NumField label="불투명도 %" value={spec.overlay.opacity * 100} min={0} max={100} onChange={(v) => {
              const next = sf().clone(spec);
              if (next.overlay) next.overlay.opacity = Math.max(0, Math.min(1, v / 100));
              props.onChange(sf().touch(next, {}));
            }} />
            <div className="row-btns">
              <button type="button" className="btn ghost small" onClick={() => overlayInput.current?.click()}><Icon name="upload" size={13} /> 교체</button>
              <button type="button" className="btn ghost small danger" onClick={props.onRemoveOverlay}><Icon name="trash" size={13} /> 제거</button>
            </div>
          </>
        ) : (
          <button type="button" className="drop-zone" onClick={() => overlayInput.current?.click()}>
            <Icon name="upload" size={18} />
            <span>투명 PNG 올리기</span>
            <small>파일 선택 또는 끌어다 놓기</small>
          </button>
        )}
        <input
          ref={overlayInput}
          type="file"
          accept="image/png,image/webp,image/svg+xml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onOverlayFile(file);
            event.target.value = '';
          }}
        />
      </section>

      <input
        ref={slotInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onSlotFile(slotIndex.current, file);
          event.target.value = '';
        }}
      />
      <p className="panel-foot">자동 저장 중 · .shutterframe.json v1</p>
    </aside>
  );
}

function toHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return '#f4f1ea';
}
